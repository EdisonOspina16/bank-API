import { Request, Response } from 'express';
import prisma from '../../../infrastructure/database/prisma-client';

export async function listAccounts(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthenticated.' });

  try {
    const accounts = await prisma.account.findMany({
      where: { userId, deletedAt: null },
      include: { currency: true },
      orderBy: { createdAt: 'asc' },
    });

    return res.json({ accounts: accounts.map(a => ({
      id: a.id,
      accountNumber: a.accountNumber,
      type: a.type,
      plan: a.plan,
      balance: Number(a.balance),
      currency: a.currency.code,
    })) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to list accounts.' });
  }
}

export default { listAccounts };
