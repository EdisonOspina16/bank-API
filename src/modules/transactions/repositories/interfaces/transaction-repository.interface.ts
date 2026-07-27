import { Transaction, TransactionStatus, TransactionType } from '@prisma/client';

export interface CreateTransactionInput {
  idempotencyKey: string;
  type: TransactionType;
  description?: string;
  legs: {
    accountId?: string;
    amount: number; // positive = credit, negative = debit on the account
    description?: string;
    ledgerAccountId: string;
  }[];
}

export interface ITransactionRepository {
  findById(id: string): Promise<Transaction | null>;
  findByIdempotencyKey(key: string): Promise<Transaction | null>;
  create(data: CreateTransactionInput): Promise<Transaction>;
  updateStatus(id: string, status: TransactionStatus, errorMessage?: string): Promise<Transaction>;
}
