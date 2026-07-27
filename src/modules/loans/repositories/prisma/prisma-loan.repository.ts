import { Loan, LoanStatus } from '@prisma/client';
import { ILoanRepository } from '../interfaces/loan-repository.interface';
import prisma from '../../../../infrastructure/database/prisma-client';

export class PrismaLoanRepository implements ILoanRepository {
  async findById(id: string): Promise<Loan | null> {
    return prisma.loan.findUnique({
      where: { id },
      include: { installments: true, amortizations: true },
    });
  }

  async findByAccountId(accountId: string): Promise<Loan[]> {
    return prisma.loan.findMany({
      where: { accountId },
      include: {
        installments: { where: { isPaid: false }, orderBy: { dueDate: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    accountId: string;
    amount: number;
    interestRate: number;
    termMonths: number;
    monthlyPayment: number;
  }): Promise<Loan> {
    return prisma.loan.create({ data });
  }

  async updateStatus(id: string, status: LoanStatus): Promise<Loan> {
    const updateData: Partial<{ status: LoanStatus; disbursedAt: Date }> = { status };
    if (status === LoanStatus.DISBURSED) {
      updateData.disbursedAt = new Date();
    }
    return prisma.loan.update({ where: { id }, data: updateData });
  }
}

export default PrismaLoanRepository;
