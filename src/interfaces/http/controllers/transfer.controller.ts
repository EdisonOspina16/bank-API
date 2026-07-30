import { Request, Response } from 'express';
import prisma from '../../../infrastructure/database/prisma-client';
import { TransactionService } from '../../../modules/transactions/services/transaction.service';
import { maskFullName } from '../../../lib/mask-name';
import { v4 as uuidv4 } from 'uuid';

const txService = new TransactionService();

export async function lookupRecipient(req: Request, res: Response) {
  const userId = req.userId;
  const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';

  if (!userId) return res.status(401).json({ error: 'Unauthenticated.' });
  if (!phone) return res.status(400).json({ error: 'Missing phone.' });

  try {
    const receiverUser = await prisma.user.findUnique({
      where: { phoneNumber: phone },
      include: { customerProfile: true },
    });
    if (!receiverUser?.customerProfile) {
      return res.status(404).json({ error: 'Recipient user not found.' });
    }

    const { firstName, lastName } = receiverUser.customerProfile;

    return res.json({
      maskedName: maskFullName(firstName, lastName),
      recipientName: `${firstName} ${lastName}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Lookup failed.' });
  }
}

export async function createTransfer(req: Request, res: Response) {
  const { toPhone, amount, currency = 'COP', description, idempotencyKey } = req.body;
  const userId = req.userId;

  if (!userId) return res.status(401).json({ error: 'Unauthenticated.' });
  if (!toPhone || !amount) return res.status(400).json({ error: 'Missing toPhone or amount.' });

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount.' });

  try {
    // Find sender account for requested currency
    const senderAccount = await prisma.account.findFirst({
      where: { userId, currency: { code: currency } },
    });
    if (!senderAccount) return res.status(404).json({ error: `Sender account (${currency}) not found.` });

    // Find receiver user by phone number
    const receiverUser = await prisma.user.findUnique({
      where: { phoneNumber: toPhone },
      include: { customerProfile: true },
    });
    if (!receiverUser?.customerProfile) {
      return res.status(404).json({ error: 'Recipient user not found.' });
    }

    const receiverAccount = await prisma.account.findFirst({
      where: { userId: receiverUser.id, currency: { code: currency } },
    });
    if (!receiverAccount) return res.status(404).json({ error: `Recipient account (${currency}) not found.` });

    const key = idempotencyKey ?? uuidv4();
    const { firstName, lastName } = receiverUser.customerProfile;
    const recipientName = `${firstName} ${lastName}`;
    const transferDescription =
      description ?? `Transferencia a ${recipientName}`;

    const result = await txService.internalTransfer({
      idempotencyKey: key,
      senderAccountId: senderAccount.id,
      receiverAccountId: receiverAccount.id,
      amount: amt,
      description: transferDescription,
    });

    return res.json({
      success: true,
      transaction: result.transaction,
      senderBalance: result.senderNewBalance,
      receiverBalance: result.receiverNewBalance,
      recipientName,
      maskedRecipientName: maskFullName(firstName, lastName),
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Transfer failed.' });
  }
}

export default { createTransfer, lookupRecipient };
