import { Account, AccountPlan, AccountType } from '@prisma/client';
import { IAccountRepository } from '../interfaces/account-repository.interface';
import prisma from '../../../../infrastructure/database/prisma-client';

export class PrismaAccountRepository implements IAccountRepository {
  async findById(id: string): Promise<Account | null> {
    return prisma.account.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findByUserId(userId: string): Promise<Account[]> {
    return prisma.account.findMany({
      where: { userId, deletedAt: null },
      include: { currency: true },
    });
  }

  async findByAccountNumber(accountNumber: string): Promise<Account | null> {
    return prisma.account.findFirst({
      where: { accountNumber, deletedAt: null },
    });
  }

  async create(data: {
    userId: string;
    accountNumber: string;
    type: AccountType;
    plan: AccountPlan;
    currencyId: string;
  }): Promise<Account> {
    return prisma.account.create({ data });
  }

  async updateBalance(
    id: string,
    amount: number,
    version: number
  ): Promise<Account> {
    // Optimistic Locking: fail if version mismatch
    const result = await prisma.account.updateMany({
      where: { id, version, deletedAt: null },
      data: {
        balance: { increment: amount },
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new Error(
        `Optimistic lock failed for account ${id}. Concurrent modification detected.`
      );
    }

    return prisma.account.findFirstOrThrow({ where: { id } });
  }

  async softDelete(id: string): Promise<Account> {
    return prisma.account.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}

export default PrismaAccountRepository;
