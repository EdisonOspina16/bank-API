import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import prisma from '../../../infrastructure/database/prisma-client';
import { LoanService } from '../../../modules/loans/services/loan.service';

const loanService = new LoanService();

const ANNUAL_INTEREST_RATE = 0.18;

export async function requestDisbursement(req: Request, res: Response) {
  const userId = req.userId;
  const { amount, termMonths, idempotencyKey } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthenticated.' });
  }

  const loanAmount = Number(amount);
  const months = Number(termMonths);

  if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
    return res.status(400).json({ error: 'Invalid loan amount.' });
  }

  if (!Number.isInteger(months) || months <= 0) {
    return res.status(400).json({ error: 'Invalid loan term.' });
  }

  try {
    const account = await prisma.account.findFirst({
      where: {
        userId,
        deletedAt: null,
        currency: { code: 'COP' },
      },
      select: { id: true },
    });

    if (!account) {
      return res.status(404).json({ error: 'COP account not found.' });
    }

    const result = await loanService.disburseLoan(
      account.id,
      loanAmount,
      ANNUAL_INTEREST_RATE,
      months,
      idempotencyKey || randomUUID()
    );

    return res.status(201).json({
      success: true,
      loan: {
        id: result.loan.id,
        amount: Number(result.loan.amount),
        termMonths: result.loan.termMonths,
        monthlyPayment: Number(result.loan.monthlyPayment),
        status: result.loan.status,
        disbursedAt: result.loan.disbursedAt,
      },
      transactionId: result.transactionId,
      accountBalance: result.newBalance,
    });
  } catch (err: any) {
    return res.status(400).json({
      error: err.message || 'Loan disbursement failed.',
    });
  }
}

export default { requestDisbursement };