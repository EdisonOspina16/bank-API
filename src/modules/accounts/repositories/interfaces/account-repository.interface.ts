import { Account, AccountPlan, AccountType } from '@prisma/client';

export interface IAccountRepository {
  findById(id: string): Promise<Account | null>;
  findByUserId(userId: string): Promise<Account[]>;
  findByAccountNumber(accountNumber: string): Promise<Account | null>;
  create(data: {
    userId: string;
    accountNumber: string;
    type: AccountType;
    plan: AccountPlan;
    currencyId: string;
  }): Promise<Account>;
  /**
   * Updates the balance using optimistic locking.
   * @param id Account UUID
   * @param amount Signed delta (positive = credit, negative = debit)
   * @param version Current version to prevent race conditions
   */
  updateBalance(id: string, amount: number, version: number): Promise<Account>;
  softDelete(id: string): Promise<Account>;
}
