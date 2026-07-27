import { Transaction, TransactionStatus } from '@prisma/client';
import prisma from '../../../../infrastructure/database/prisma-client';
import {
  CreateTransactionInput,
  ITransactionRepository,
} from '../interfaces/transaction-repository.interface';

export class PrismaTransactionRepository implements ITransactionRepository {
  async findById(id: string): Promise<Transaction | null> {
    return prisma.transaction.findUnique({ where: { id } });
  }

  async findByIdempotencyKey(key: string): Promise<Transaction | null> {
    return prisma.transaction.findUnique({ where: { idempotencyKey: key } });
  }

  /**
   * Creates a Transaction with all its TransactionLegs atomically.
   * This does NOT update account balances or ledger entries — that is
   * the responsibility of the higher-level TransactionService using
   * an Interactive Prisma Transaction.
   */
  async create(data: CreateTransactionInput): Promise<Transaction> {
    return prisma.transaction.create({
      data: {
        idempotencyKey: data.idempotencyKey,
        type: data.type,
        description: data.description,
        legs: {
          create: data.legs.map((leg) => ({
            accountId: leg.accountId,
            amount: leg.amount,
            description: leg.description,
          })),
        },
      },
      include: { legs: true },
    });
  }

  async updateStatus(
    id: string,
    status: TransactionStatus,
    errorMessage?: string
  ): Promise<Transaction> {
    return prisma.transaction.update({
      where: { id },
      data: { status, errorMessage },
    });
  }
}

export default PrismaTransactionRepository;
