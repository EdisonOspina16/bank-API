import { Loan, LoanStatus } from '@prisma/client';

export interface ILoanRepository {
  findById(id: string): Promise<Loan | null>;
  findByAccountId(accountId: string): Promise<Loan[]>;
  create(data: {
    accountId: string;
    amount: number;
    interestRate: number;
    termMonths: number;
    monthlyPayment: number;
  }): Promise<Loan>;
  updateStatus(id: string, status: LoanStatus): Promise<Loan>;
}
