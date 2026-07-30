import { Request, Response } from 'express';
import prisma from '../../../infrastructure/database/prisma-client';

export async function listMovements(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthenticated.' });

  try {
    const accounts = await prisma.account.findMany({ where: { userId }, select: { id: true } });
    const accountIds = accounts.map(a => a.id);

    const movements = await prisma.movement.findMany({
      where: { accountId: { in: accountIds } },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const result = movements.map(m => ({
      id: m.id,
      accountId: m.accountId,
      amount: Number(m.amount),
      description: m.description,
      category: m.category?.name ?? null,
      createdAt: m.createdAt,
    }));

    return res.json({ movements: result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to list movements.' });
  }
}

export async function getMovementDetail(req: Request, res: Response) {
  const userId = req.userId;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!userId) return res.status(401).json({ error: 'Unauthenticated.' });

  try {
    const movement = await prisma.movement.findUnique({
      where: { id },
      include: {
        category: true,
        account: { include: { currency: true } },
      },
    });
    if (!movement) return res.status(404).json({ error: 'Movement not found.' });

    if (movement.account.userId !== userId) return res.status(403).json({ error: 'Access denied.' });

    const refCode =
      movement.reference?.replace(/-/g, '').slice(0, 10).toUpperCase() ||
      movement.id.replace(/-/g, '').slice(0, 10).toUpperCase();

    let counterpartyName: string | null = null;
    if (movement.reference) {
      const transfer = await prisma.transfer.findFirst({
        where: { transactionId: movement.reference },
        include: {
          senderAccount: { include: { user: { include: { customerProfile: true } } } },
          receiverAccount: { include: { user: { include: { customerProfile: true } } } },
        },
      });

      if (transfer) {
        const isSender = transfer.senderAccountId === movement.accountId;
        const counterpartyUser = isSender
          ? transfer.receiverAccount?.user
          : transfer.senderAccount?.user;
        const profile = counterpartyUser?.customerProfile;
        if (profile) {
          counterpartyName = `${profile.firstName} ${profile.lastName}`;
        }
      }
    }

    return res.json({
      id: movement.id,
      accountId: movement.accountId,
      accountNumber: movement.account.accountNumber,
      currency: movement.account.currency.code,
      amount: Number(movement.amount),
      description: movement.description,
      category: movement.category?.name ?? null,
      reference: movement.reference,
      referenceCode: refCode,
      status: 'COMPLETED',
      createdAt: movement.createdAt,
      counterpartyName,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to get movement detail.' });
  }
}

export default { listMovements, getMovementDetail };
