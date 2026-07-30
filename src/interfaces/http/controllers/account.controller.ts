import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../../infrastructure/database/prisma-client';
import { NotificationService } from '../../../modules/notifications/services/notification.service';
import { DebitCardService } from '../../../modules/cards/services/debit-card.service';

const notificationService = new NotificationService();
const debitCardService = new DebitCardService();

export async function listAccounts(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthenticated.' });

  try {
    const accounts = await prisma.account.findMany({
      where: { userId, deletedAt: null },
      include: { currency: true },
      orderBy: { createdAt: 'asc' },
    });

    return res.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        accountNumber: a.accountNumber,
        type: a.type,
        plan: a.plan,
        balance: Number(a.balance),
        currency: a.currency.code,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to list accounts.' });
  }
}

/**
 * Withdraw money from the user's COP savings account.
 */
export async function withdraw(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthenticated.' });

  const amount = Number(req.body.amount);
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Monto de retiro inválido.' });
  }

  try {
    const account = await prisma.account.findFirst({
      where: { userId, deletedAt: null, currency: { code: 'COP' }, type: 'SAVINGS' },
    }) || await prisma.account.findFirst({
      where: { userId, deletedAt: null, currency: { code: 'COP' } },
    });

    if (!account) {
      return res.status(404).json({ error: 'Cuenta COP no encontrada.' });
    }

    if (Number(account.balance) < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente.' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const fresh = await tx.account.update({
        where: { id: account.id, version: account.version },
        data: {
          balance: { decrement: amount },
          version: { increment: 1 },
        },
      });

      let category = await tx.movementCategory.findUnique({ where: { name: 'Retiro' } });
      if (!category) {
        category = await tx.movementCategory.create({
          data: { name: 'Retiro', iconType: 'withdraw' },
        });
      }

      const transaction = await tx.transaction.create({
        data: {
          idempotencyKey: uuidv4(),
          type: 'WITHDRAWAL',
          status: 'COMPLETED',
          description: 'Retiro de efectivo',
        },
      });

      await tx.movement.create({
        data: {
          accountId: account.id,
          movementCategoryId: category.id,
          amount: new Prisma.Decimal(-amount),
          description: 'Retiro de efectivo',
          reference: transaction.id,
        },
      });

      return fresh;
    });

    await debitCardService.syncSaldoFromAccount(userId);
    await notificationService.createNotification(
      userId,
      'retiro_realizado',
      'Retiro realizado',
      `Retiraste $${amount.toLocaleString('es-CO')}. Nuevo saldo: $${Number(updated.balance).toLocaleString('es-CO')}.`
    );

    return res.json({
      success: true,
      balance: Number(updated.balance),
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'No se pudo completar el retiro.' });
  }
}

/**
 * Deposit money into the user's COP savings account (simulator / own funding).
 */
export async function deposit(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthenticated.' });

  const amount = Number(req.body.amount);
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Monto de depósito inválido.' });
  }

  try {
    const account = await prisma.account.findFirst({
      where: { userId, deletedAt: null, currency: { code: 'COP' }, type: 'SAVINGS' },
    }) || await prisma.account.findFirst({
      where: { userId, deletedAt: null, currency: { code: 'COP' } },
    });

    if (!account) {
      return res.status(404).json({ error: 'Cuenta COP no encontrada.' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const fresh = await tx.account.update({
        where: { id: account.id, version: account.version },
        data: {
          balance: { increment: amount },
          version: { increment: 1 },
        },
      });

      let category = await tx.movementCategory.findUnique({ where: { name: 'Depósito' } });
      if (!category) {
        category = await tx.movementCategory.create({
          data: { name: 'Depósito', iconType: 'deposit' },
        });
      }

      const transaction = await tx.transaction.create({
        data: {
          idempotencyKey: uuidv4(),
          type: 'DEPOSIT',
          status: 'COMPLETED',
          description: 'Depósito a cuenta',
        },
      });

      await tx.movement.create({
        data: {
          accountId: account.id,
          movementCategoryId: category.id,
          amount: new Prisma.Decimal(amount),
          description: 'Depósito a cuenta',
          reference: transaction.id,
        },
      });

      return fresh;
    });

    await debitCardService.syncSaldoFromAccount(userId);
    await notificationService.createNotification(
      userId,
      'deposito_realizado',
      'Depósito recibido',
      `Se acreditaron $${amount.toLocaleString('es-CO')} en tu cuenta. Nuevo saldo: $${Number(updated.balance).toLocaleString('es-CO')}.`
    );

    return res.json({
      success: true,
      balance: Number(updated.balance),
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'No se pudo completar el depósito.' });
  }
}

export default { listAccounts, withdraw, deposit };
