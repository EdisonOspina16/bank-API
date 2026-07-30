import {
  Loan,
  LoanInstallment,
  LoanStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import prisma from '../../../infrastructure/database/prisma-client';
import { PrismaLoanRepository } from '../repositories/prisma/prisma-loan.repository';

export interface LoanSimulationResult {
  amount: number;
  interestRate: number;   // Annual rate, e.g. 0.24 = 24%
  termMonths: number;
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  amortizationTable: {
    month: number;
    principal: number;
    interest: number;
    totalPayment: number;
    balance: number;
  }[];
}

export interface LoanDisbursementResult {
  loan: Loan;
  transactionId: string;
  newBalance: number;
}

export class LoanService {
  private readonly loanRepo: PrismaLoanRepository;

  constructor() {
    this.loanRepo = new PrismaLoanRepository();
  }

  // ─── SIMULATE ───────────────────────────────────────────────────────────────

  simulate(amount: number, annualRate: number, termMonths: number): LoanSimulationResult {
    const monthlyRate = annualRate / 12;

    // French Amortization (cuota fija): M = P * [r(1+r)^n] / [(1+r)^n - 1]
    const factor = Math.pow(1 + monthlyRate, termMonths);
    const monthlyPayment = (amount * monthlyRate * factor) / (factor - 1);
    const totalPayment = monthlyPayment * termMonths;
    const totalInterest = totalPayment - amount;

    const table: LoanSimulationResult['amortizationTable'] = [];
    let balance = amount;

    for (let month = 1; month <= termMonths; month++) {
      const interestPart = balance * monthlyRate;
      const principalPart = monthlyPayment - interestPart;
      balance -= principalPart;

      table.push({
        month,
        principal: Math.round(principalPart * 100) / 100,
        interest: Math.round(interestPart * 100) / 100,
        totalPayment: Math.round(monthlyPayment * 100) / 100,
        balance: Math.max(0, Math.round(balance * 100) / 100),
      });
    }

    return {
      amount,
      interestRate: annualRate,
      termMonths,
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
      totalPayment: Math.round(totalPayment * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      amortizationTable: table,
    };
  }

  // ─── REQUEST LOAN ───────────────────────────────────────────────────────────

  async requestLoan(
    accountId: string,
    amount: number,
    annualRate: number,
    termMonths: number
  ): Promise<Loan> {
    const simulation = this.simulate(amount, annualRate, termMonths);

    return prisma.$transaction(async (tx) => {
      // 1. Create the loan
      const loan = await tx.loan.create({
        data: {
          accountId,
          amount,
          interestRate: annualRate,
          termMonths,
          monthlyPayment: simulation.monthlyPayment,
          status: LoanStatus.PENDING_APPROVAL,
        },
      });

      // 2. Persist amortization table
      await tx.loanAmortization.createMany({
        data: simulation.amortizationTable.map((row) => ({
          loanId: loan.id,
          month: row.month,
          principal: row.principal,
          interest: row.interest,
          totalPayment: row.totalPayment,
          balance: row.balance,
        })),
      });

      // 3. Generate installment schedule
      const now = new Date();
      await tx.loanInstallment.createMany({
        data: simulation.amortizationTable.map((row) => {
          const dueDate = new Date(now);
          dueDate.setMonth(dueDate.getMonth() + row.month);
          return {
            loanId: loan.id,
            installmentNumber: row.month,
            dueDate,
            principalAmount: row.principal,
            interestAmount: row.interest,
            totalAmount: row.totalPayment,
            remainingBalance: row.balance,
          };
        }),
      });

      return loan;
    });
  }
    // ─── DISBURSE LOAN ─────────────────────────────────────────────────────────

  async disburseLoan(
    accountId: string,
    amount: number,
    annualRate: number,
    termMonths: number,
    idempotencyKey: string
  ): Promise<LoanDisbursementResult> {
    const simulation = this.simulate(amount, annualRate, termMonths);

    return prisma.$transaction(async (tx) => {
      const account = await tx.account.findFirst({
        where: {
          id: accountId,
          deletedAt: null,
        },
      });

      if (!account) {
        throw new Error('Account not found.');
      }

      const existingTransaction = await tx.transaction.findUnique({
        where: { idempotencyKey },
      });

      if (existingTransaction) {
        throw new Error('This loan disbursement has already been processed.');
      }

      const transaction = await tx.transaction.create({
        data: {
          idempotencyKey,
          type: TransactionType.LOAN_DISBURSEMENT,
          status: TransactionStatus.PENDING,
          description: 'Desembolso de préstamo',
        },
      });

      const loan = await tx.loan.create({
        data: {
          accountId,
          amount,
          interestRate: annualRate,
          termMonths,
          monthlyPayment: simulation.monthlyPayment,
          status: LoanStatus.DISBURSED,
          disbursedAt: new Date(),
        },
      });

      await tx.loanAmortization.createMany({
        data: simulation.amortizationTable.map((row) => ({
          loanId: loan.id,
          month: row.month,
          principal: row.principal,
          interest: row.interest,
          totalPayment: row.totalPayment,
          balance: row.balance,
        })),
      });

      const now = new Date();

      await tx.loanInstallment.createMany({
        data: simulation.amortizationTable.map((row) => {
          const dueDate = new Date(now);
          dueDate.setMonth(dueDate.getMonth() + row.month);

          return {
            loanId: loan.id,
            installmentNumber: row.month,
            dueDate,
            principalAmount: row.principal,
            interestAmount: row.interest,
            totalAmount: row.totalPayment,
            remainingBalance: row.balance,
          };
        }),
      });

      await tx.transactionLeg.createMany({
        data: [
          {
            transactionId: transaction.id,
            accountId,
            amount,
            description: 'Abono por desembolso de préstamo',
          },
          {
            transactionId: transaction.id,
            accountId: null,
            amount: -amount,
            description: 'Contrapartida de desembolso de préstamo',
          },
        ],
      });

      let category = await tx.movementCategory.findUnique({
        where: { name: 'Préstamo' },
      });

      if (!category) {
        category = await tx.movementCategory.create({
          data: {
            name: 'Préstamo',
            iconType: 'loan',
          },
        });
      }

      await tx.movement.create({
        data: {
          accountId,
          movementCategoryId: category.id,
          amount,
          description: 'Desembolso de préstamo',
          reference: transaction.id,
        },
      });

      const updated = await tx.account.updateMany({
        where: {
          id: accountId,
          version: account.version,
          deletedAt: null,
        },
        data: {
          balance: { increment: amount },
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        throw new Error('Concurrent modification detected. Please try again.');
      }

      const updatedAccount = await tx.account.findUniqueOrThrow({
        where: { id: accountId },
      });

      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.COMPLETED },
      });

      return {
        loan,
        transactionId: transaction.id,
        newBalance: Number(updatedAccount.balance),
      };
    });
  }
  // ─── GET LOANS ──────────────────────────────────────────────────────────────

  async getLoansByAccount(accountId: string): Promise<Loan[]> {
    return this.loanRepo.findByAccountId(accountId);
  }

  // ─── GET NEXT INSTALLMENT ───────────────────────────────────────────────────

  async getNextInstallment(loanId: string): Promise<LoanInstallment | null> {
    return prisma.loanInstallment.findFirst({
      where: { loanId, isPaid: false },
      orderBy: { dueDate: 'asc' },
    });
  }
}

export default LoanService;
