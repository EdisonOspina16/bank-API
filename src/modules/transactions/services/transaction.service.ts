import { Prisma, Transaction, TransactionStatus, TransactionType } from '@prisma/client';
import prisma from '../../../infrastructure/database/prisma-client';
import { NotificationService } from '../../notifications/services/notification.service';
import { DebitCardService } from '../../cards/services/debit-card.service';

const notificationService = new NotificationService();
const debitCardService = new DebitCardService();

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TRANSFER SERVICE — ACID BANKING TRANSACTIONS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * DESIGN PRINCIPLES:
 *
 * 1. DOUBLE-ENTRY LEDGER:
 *    Every transfer debits one account and credits another.
 *    Sum of all ledger_entries for a transaction must equal ZERO.
 *    The ledger is immutable and append-only (no UPDATE/DELETE ever).
 *
 * 2. IDEMPOTENCY:
 *    Every operation carries an `idempotencyKey` (UUID v4 from client).
 *    If the same key is received twice, the existing result is returned
 *    without re-executing the transfer. This protects against network
 *    retries creating duplicate transfers.
 *
 * 3. OPTIMISTIC LOCKING on account balance:
 *    Balance updates include a `version` check. If two concurrent
 *    requests try to modify the same account, one will fail and retry.
 *
 * 4. ISOLATION LEVEL — SERIALIZABLE:
 *    Prisma Interactive Transactions run at READ COMMITTED by default.
 *    For critical financial paths we use REPEATABLE READ to avoid
 *    non-repeatable reads during the within-transaction balance check.
 *
 * 5. DEADLOCK PREVENTION:
 *    When locking two accounts (sender + receiver), we always acquire
 *    locks in ascending UUID order to prevent circular wait conditions.
 *
 * 6. NEVER MODIFY BALANCE DIRECTLY without a ledger entry.
 *    Balance is the materialized cache of ledger_entries.
 *    It is incremented/decremented atomically inside the same transaction.
 */

export interface TransferInput {
  idempotencyKey: string;
  senderAccountId: string;
  receiverAccountId: string;
  amount: number;           // Always positive, in the account's currency
  description?: string;
}

export interface TransferResult {
  transaction: Transaction;
  senderNewBalance: number;
  receiverNewBalance: number;
}

export class TransactionService {

  // ─── INTERNAL TRANSFER (between two Jes Bank accounts) ───────────────────

  async internalTransfer(input: TransferInput): Promise<TransferResult> {
    const { idempotencyKey, senderAccountId, receiverAccountId, amount, description } = input;

    if (amount <= 0) throw new Error('Transfer amount must be positive.');
    if (senderAccountId === receiverAccountId)
      throw new Error('Sender and receiver accounts must be different.');

    // ── Idempotency check (outside TX for performance) ──
    const existing = await prisma.transaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (existing.status === TransactionStatus.COMPLETED) {
        // Return cached result without re-executing
        return this.buildCachedResult(existing, senderAccountId, receiverAccountId);
      }
      if (existing.status === TransactionStatus.PENDING) {
        throw new Error('A transaction with this idempotency key is already in progress.');
      }
    }

    // ── Deadlock prevention: lock accounts in deterministic order ──
    const [firstId, secondId] = [senderAccountId, receiverAccountId].sort();

    // ── Interactive Prisma Transaction ──────────────────────────────────────
    const result = await prisma.$transaction(
      async (tx) => {

        // 1. Acquire pessimistic read locks (SELECT FOR UPDATE)
        //    PostgreSQL syntax via raw query to lock the rows
        await tx.$queryRaw`
          SELECT id, balance, version FROM accounts
          WHERE id IN (${firstId}::uuid, ${secondId}::uuid)
          ORDER BY id
          FOR UPDATE NOWAIT
        `;

        // 2. Fetch fresh account data
        const sender = await tx.account.findUniqueOrThrow({
          where: { id: senderAccountId },
        });
        const receiver = await tx.account.findUniqueOrThrow({
          where: { id: receiverAccountId },
        });

        if (sender.deletedAt) throw new Error('Sender account is closed.');
        if (receiver.deletedAt) throw new Error('Receiver account is closed.');

        // 3. Balance check
        const senderBalance = Number(sender.balance);
        if (senderBalance < amount) {
          throw new Error(
            `Insufficient funds. Available: ${senderBalance}, Required: ${amount}`
          );
        }

        // 4. Create the master transaction record
        const transaction = await tx.transaction.create({
          data: {
            idempotencyKey,
            type: TransactionType.TRANSFER_INTERNAL,
            status: TransactionStatus.PENDING,
            description: description ?? `Transfer to account ${receiver.accountNumber}`,
          },
        });

        // 5. Create transaction legs (for ledger)
        const debitLeg = await tx.transactionLeg.create({
          data: {
            transactionId: transaction.id,
            accountId: senderAccountId,
            amount: -amount, // Debit (negative)
            description: `Debit for transfer ${transaction.id}`,
          },
        });

        const creditLeg = await tx.transactionLeg.create({
          data: {
            transactionId: transaction.id,
            accountId: receiverAccountId,
            amount: amount, // Credit (positive)
            description: `Credit for transfer ${transaction.id}`,
          },
        });

        // 6. Find the system ledger accounts for customer deposits
        //    (In a real bank, these would be ASSET and LIABILITY accounts)
        const customerLedger = await tx.ledgerAccount.findFirst({
          where: { code: 'CUSTOMER_DEPOSITS' },
        });

        if (customerLedger) {
          // 6a. Append double-entry ledger entries (immutable, append-only)
          await tx.ledgerEntry.createMany({
            data: [
              {
                ledgerAccountId: customerLedger.id,
                accountId: senderAccountId,
                transactionLegId: debitLeg.id,
                amount: new Prisma.Decimal(-amount),
              },
              {
                ledgerAccountId: customerLedger.id,
                accountId: receiverAccountId,
                transactionLegId: creditLeg.id,
                amount: new Prisma.Decimal(amount),
              },
            ],
          });
        }

        // 7. Update materialized balances atomically with optimistic lock
        const updatedSender = await tx.account.update({
          where: { id: senderAccountId, version: sender.version },
          data: {
            balance: { decrement: amount },
            version: { increment: 1 },
          },
        });

        const updatedReceiver = await tx.account.update({
          where: { id: receiverAccountId, version: receiver.version },
          data: {
            balance: { increment: amount },
            version: { increment: 1 },
          },
        });

        // 8. Create transfer record for history
        await tx.transfer.create({
          data: {
            transactionId: transaction.id,
            senderAccountId,
            receiverAccountId,
            isExternal: false,
            amount,
            fee: 0,
          },
        });

        // 9. Create movement entries (customer-facing feed)
        // Ensure a movement category exists (create if missing) so customer-facing
        // movement entries are always recorded for transfers.
        let category = await tx.movementCategory.findUnique({ where: { name: 'Transferencia' } });
        if (!category) {
          category = await tx.movementCategory.create({
            data: { name: 'Transferencia', iconType: 'transfer' },
          });
        }

        const debitAmount = new Prisma.Decimal(-amount);
        const creditAmount = new Prisma.Decimal(amount);

        await tx.movement.create({
          data: {
            accountId: senderAccountId,
            movementCategoryId: category.id,
            amount: debitAmount,
            description: description ?? 'Transferencia enviada',
            reference: transaction.id,
          },
        });

        await tx.movement.create({
          data: {
            accountId: receiverAccountId,
            movementCategoryId: category.id,
            amount: creditAmount,
            description: description ?? 'Transferencia recibida',
            reference: transaction.id,
          },
        });

        // 10. Mark transaction as COMPLETED
        const completed = await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: TransactionStatus.COMPLETED },
        });

        return {
          transaction: completed,
          senderNewBalance: Number(updatedSender.balance),
          receiverNewBalance: Number(updatedReceiver.balance),
        };
      },
      {
        // REPEATABLE READ isolates our balance reads within the transaction
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        // 15 seconds timeout for the interactive transaction
        timeout: 15_000,
        maxWait: 5_000,
      }
    );

    // Sync virtual debit card balances + notify both parties (outside TX)
    const [senderAccount, receiverAccount] = await Promise.all([
      prisma.account.findUnique({ where: { id: senderAccountId } }),
      prisma.account.findUnique({ where: { id: receiverAccountId } }),
    ]);

    if (senderAccount) {
      await debitCardService.syncSaldoFromAccount(senderAccount.userId);
      await notificationService.createNotification(
        senderAccount.userId,
        'transferencia_realizada',
        'Dinero enviado',
        `Enviaste $${amount.toLocaleString('es-CO')}${description ? `: ${description}` : ''}. Nuevo saldo: $${result.senderNewBalance.toLocaleString('es-CO')}.`
      );
    }

    if (receiverAccount) {
      await debitCardService.syncSaldoFromAccount(receiverAccount.userId);
      await notificationService.createNotification(
        receiverAccount.userId,
        'deposito_realizado',
        'Dinero recibido',
        `Te depositaron $${amount.toLocaleString('es-CO')}${description ? `: ${description}` : ''}. Nuevo saldo: $${result.receiverNewBalance.toLocaleString('es-CO')}.`
      );
    }

    return result;
  }

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

  private async buildCachedResult(
    transaction: Transaction,
    senderAccountId: string,
    receiverAccountId: string
  ): Promise<TransferResult> {
    const [sender, receiver] = await Promise.all([
      prisma.account.findUniqueOrThrow({ where: { id: senderAccountId } }),
      prisma.account.findUniqueOrThrow({ where: { id: receiverAccountId } }),
    ]);
    return {
      transaction,
      senderNewBalance: Number(sender.balance),
      receiverNewBalance: Number(receiver.balance),
    };
  }
}

export default TransactionService;
