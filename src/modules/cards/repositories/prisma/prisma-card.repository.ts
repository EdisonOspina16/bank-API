import { Card, CardBrand, CardStatus, CardType } from '@prisma/client';
import { ICardRepository } from '../interfaces/card-repository.interface';
import prisma from '../../../../infrastructure/database/prisma-client';

export class PrismaCardRepository implements ICardRepository {
  async findById(id: string): Promise<Card | null> {
    return prisma.card.findFirst({ where: { id, deletedAt: null } });
  }

  async findByAccountId(accountId: string): Promise<Card[]> {
    return prisma.card.findMany({
      where: { accountId, deletedAt: null },
      include: { controls: true },
    });
  }

  async create(data: {
    accountId: string;
    type: CardType;
    brand: CardBrand;
    numberHash: string;
    maskedNumber: string;
    expirationMonth: number;
    expirationYear: number;
    cvvHash: string;
    pinHash?: string;
  }): Promise<Card> {
    return prisma.card.create({
      data: {
        ...data,
        controls: {
          // Create default controls when a card is issued
          create: {
            dailyLimit: 2_000_000,
            allowOnline: true,
            allowAtm: true,
            allowForeign: false,
          },
        },
      },
    });
  }

  async updateStatus(id: string, status: CardStatus): Promise<Card> {
    return prisma.card.update({ where: { id }, data: { status } });
  }

  async softDelete(id: string): Promise<Card> {
    return prisma.card.update({
      where: { id },
      data: { deletedAt: new Date(), status: CardStatus.BLOCKED_PERMANENT },
    });
  }
}

export default PrismaCardRepository;
