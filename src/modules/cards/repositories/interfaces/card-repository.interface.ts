import { Card, CardStatus, CardType, CardBrand } from '@prisma/client';

export interface ICardRepository {
  findById(id: string): Promise<Card | null>;
  findByAccountId(accountId: string): Promise<Card[]>;
  create(data: {
    accountId: string;
    type: CardType;
    brand: CardBrand;
    numberHash: string;
    maskedNumber: string;
    expirationMonth: number;
    expirationYear: number;
    cvvHash: string;
    pinHash?: string;
  }): Promise<Card>;
  updateStatus(id: string, status: CardStatus): Promise<Card>;
  softDelete(id: string): Promise<Card>;
}
