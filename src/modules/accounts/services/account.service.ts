import { Account, AccountPlan, AccountType } from '@prisma/client';
import crypto from 'crypto';
import prisma from '../../../infrastructure/database/prisma-client';
import { PrismaAccountRepository } from '../repositories/prisma/prisma-account.repository';

export class AccountService {
  private readonly accountRepo: PrismaAccountRepository;

  constructor() {
    this.accountRepo = new PrismaAccountRepository();
  }

  // ─── OPEN ACCOUNT ───────────────────────────────────────────────────────────

  async openAccount(
    userId: string,
    options: {
      type?: AccountType;
      plan?: AccountPlan;
      currencyCode?: string;
    } = {}
  ): Promise<Account> {
    const { type = AccountType.DIGITAL, plan = AccountPlan.STANDARD, currencyCode = 'COP' } =
      options;

    const currency = await prisma.currency.findFirst({
      where: { code: currencyCode },
    });
    if (!currency) throw new Error(`Currency '${currencyCode}' not found.`);

    const accountNumber = this.generateAccountNumber();

    return this.accountRepo.create({
      userId,
      accountNumber,
      type,
      plan,
      currencyId: currency.id,
    });
  }

  // ─── GET ACCOUNTS ───────────────────────────────────────────────────────────

  async getAccountsByUser(userId: string): Promise<Account[]> {
    return this.accountRepo.findByUserId(userId);
  }

  async getAccountById(id: string): Promise<Account> {
    const account = await this.accountRepo.findById(id);
    if (!account) throw new Error('Account not found.');
    return account;
  }

  // ─── UPGRADE PLAN ───────────────────────────────────────────────────────────

  async upgradePlan(accountId: string, newPlan: AccountPlan): Promise<Account> {
    const account = await this.accountRepo.findById(accountId);
    if (!account) throw new Error('Account not found.');
    if (account.plan === newPlan)
      throw new Error(`Account is already on plan '${newPlan}'.`);

    return prisma.$transaction(async (tx) => {
      await tx.accountPlanHistory.create({
        data: {
          accountId,
          oldPlan: account.plan,
          newPlan,
          reason: 'Customer upgrade request',
        },
      });
      return tx.account.update({
        where: { id: accountId },
        data: { plan: newPlan },
      });
    });
  }

  // ─── PRIVATE ────────────────────────────────────────────────────────────────

  private generateAccountNumber(): string {
    // Format: JB + 12 random digits
    const suffix = crypto.randomInt(100_000_000_000, 999_999_999_999).toString();
    return `JB${suffix}`;
  }
}

export default AccountService;
