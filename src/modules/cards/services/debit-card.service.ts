import prisma from '../../../infrastructure/database/prisma-client';
import { NotificationService } from '../../notifications/services/notification.service';

const notificationService = new NotificationService();

/** Exención GMF: 350 UVT (valor UVT 2026 ≈ $49.799 → ~17.429.650). Usamos tope del prompt. */
const GMF_THRESHOLD = 16_400_000;
const GMF_RATE = 0.004;

const TAXABLE_TIPOS = new Set([
  'retiro',
  'transferencia',
  'pago_debito',
  'pago_tarjeta_credito',
]);

function normalizeTipo(tipo: string): string {
  if (tipo === 'compra') return 'pago_debito';
  return tipo;
}

function generateCardNumber(): string {
  const numero = '4821' + Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
  return numero.match(/.{1,4}/g)?.join(' ') || numero;
}

function generateCvv(): string {
  return Math.floor(100 + Math.random() * 900).toString();
}

function generateExpiry(): string {
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 5);
  return `${String(expiry.getMonth() + 1).padStart(2, '0')}/${String(expiry.getFullYear()).slice(-2)}`;
}

export class DebitCardService {
  /**
   * Resolve COP savings account balance for the user (source of truth for money).
   */
  private async getCopSavingsAccount(userId: string) {
    const accounts = await prisma.account.findMany({
      where: { userId, deletedAt: null },
      include: { currency: true },
      orderBy: { createdAt: 'asc' },
    });

    const copSavings =
      accounts.find((a) => a.currency.code === 'COP' && a.type === 'SAVINGS') ||
      accounts.find((a) => a.currency.code === 'COP') ||
      null;

    return copSavings;
  }

  /**
   * Keep tarjeta_debito.saldo aligned with the COP savings account balance.
   * Account is the source of truth after transfers/deposits/withdrawals.
   */
  async syncSaldoFromAccount(userId: string) {
    const account = await this.getCopSavingsAccount(userId);
    if (!account) return null;

    const card = await prisma.tarjetaDebito.findFirst({
      where: { usuarioId: userId },
    });
    if (!card) return null;

    const saldoCuenta = Number(account.balance);
    if (Number(card.saldo) === saldoCuenta) {
      return card;
    }

    return prisma.tarjetaDebito.update({
      where: { id: card.id },
      data: { saldo: saldoCuenta },
    });
  }

  /**
   * Get user's debit card, or create it if not exists.
   * Saldo siempre se sincroniza con la cuenta de ahorros COP.
   */
  async getOrCreateDebitCard(userId: string) {
    let card = await prisma.tarjetaDebito.findFirst({
      where: { usuarioId: userId },
      include: { bolsillos: true },
    });

    if (!card) {
      const account = await this.getCopSavingsAccount(userId);
      const saldoInicial = account ? Number(account.balance) : 0;

      const created = await prisma.tarjetaDebito.create({
        data: {
          usuarioId: userId,
          numero: generateCardNumber(),
          cvv: generateCvv(),
          cvvActualizadoEn: new Date(),
          vence: generateExpiry(),
          saldo: saldoInicial,
          acumuladoGmfMes: 0,
          mesAcumulado: new Date().getMonth() + 1,
        },
        include: { bolsillos: true },
      });

      await notificationService.createNotification(
        userId,
        'tarjeta_debito_creada',
        'Tarjeta de Débito Creada',
        `Tu tarjeta de débito digital está lista. Saldo disponible: $${saldoInicial.toLocaleString('es-CO')}.`
      );

      card = created;
    } else {
      // Sync saldo with account (transfers/deposits update accounts, not the card cache)
      const account = await this.getCopSavingsAccount(userId);
      if (account && Number(card.saldo) !== Number(account.balance)) {
        card = await prisma.tarjetaDebito.update({
          where: { id: card.id },
          data: { saldo: Number(account.balance) },
          include: { bolsillos: true },
        });
      }
    }

    // Refresh rotating CVV if necessary (every 45s) — unique per card/user
    const now = new Date();
    const elapsed = now.getTime() - new Date(card.cvvActualizadoEn).getTime();
    if (elapsed >= 45000) {
      return prisma.tarjetaDebito.update({
        where: { id: card.id },
        data: {
          cvv: generateCvv(),
          cvvActualizadoEn: now,
        },
        include: { bolsillos: true },
      });
    }

    return card;
  }

  /**
   * Holder name for the virtual card UI.
   */
  async getTitularNombre(userId: string): Promise<string> {
    const profile = await prisma.customerProfile.findUnique({
      where: { userId },
      select: { firstName: true, lastName: true },
    });
    if (!profile) return '';
    return `${profile.firstName || ''} ${profile.lastName || ''}`.trim().toUpperCase();
  }

  /**
   * Get active CVV and time left (in seconds).
   */
  async getCvv(userId: string) {
    const card = await this.getOrCreateDebitCard(userId);
    const now = new Date();
    const elapsed = now.getTime() - new Date(card.cvvActualizadoEn).getTime();
    const secondsLeft = Math.max(0, 45 - Math.floor(elapsed / 1000));
    return { cvv: card.cvv, secondsLeft };
  }

  /**
   * Keep tarjeta_debito.saldo and Account.balance in sync.
   */
  private async adjustBalances(
    tx: any,
    userId: string,
    cardId: string,
    delta: number
  ) {
    const card = await tx.tarjetaDebito.findUnique({ where: { id: cardId } });
    if (!card) throw new Error('Tarjeta de débito no encontrada.');

    const newSaldo = Number(card.saldo) + delta;
    if (newSaldo < 0) {
      throw new Error('Saldo insuficiente en la tarjeta de débito.');
    }

    await tx.tarjetaDebito.update({
      where: { id: cardId },
      data: { saldo: newSaldo },
    });

    const accounts = await tx.account.findMany({
      where: { userId, deletedAt: null },
      include: { currency: true },
    });
    const account =
      accounts.find((a: any) => a.currency.code === 'COP' && a.type === 'SAVINGS') ||
      accounts.find((a: any) => a.currency.code === 'COP');

    if (account) {
      await tx.account.update({
        where: { id: account.id },
        data: { balance: Number(account.balance) + delta },
      });
    }
  }

  /**
   * Create a pocket and deduct its limit from the main card (and account).
   */
  async createPocket(userId: string, data: { nombre: string; limite: number; icono?: string }) {
    const card = await this.getOrCreateDebitCard(userId);

    if (Number(card.saldo) < data.limite) {
      throw new Error('Saldo insuficiente en la tarjeta de débito para fondear el bolsillo.');
    }

    const pocket = await prisma.$transaction(async (tx) => {
      await this.adjustBalances(tx, userId, card.id, -data.limite);

      return tx.bolsillo.create({
        data: {
          tarjetaDebitoId: card.id,
          nombre: data.nombre,
          limite: data.limite,
          icono: data.icono || 'otro',
          saldoUsado: 0,
        },
      });
    });

    await notificationService.createNotification(
      userId,
      'bolsillo_creado',
      'Bolsillo Creado',
      `Has creado el bolsillo "${data.nombre}" con un cupo de $${data.limite.toLocaleString('es-CO')}.`
    );

    return pocket;
  }

  /**
   * Update a pocket and adjust the main card balance accordingly.
   */
  async updatePocket(
    userId: string,
    pocketId: string,
    data: { nombre: string; limite: number; icono?: string }
  ) {
    const card = await this.getOrCreateDebitCard(userId);
    const pocket = await prisma.bolsillo.findFirst({
      where: { id: pocketId, tarjetaDebitoId: card.id },
    });

    if (!pocket) {
      throw new Error('Bolsillo no encontrado.');
    }

    const oldLimit = Number(pocket.limite || 0);
    const difference = data.limite - oldLimit;

    if (difference > 0 && Number(card.saldo) < difference) {
      throw new Error('Saldo insuficiente en la tarjeta de débito para aumentar los fondos del bolsillo.');
    }

    const updatedPocket = await prisma.$transaction(async (tx) => {
      if (difference !== 0) {
        await this.adjustBalances(tx, userId, card.id, -difference);
      }

      return tx.bolsillo.update({
        where: { id: pocketId },
        data: {
          nombre: data.nombre,
          limite: data.limite,
          icono: data.icono || pocket.icono,
        },
      });
    });

    await notificationService.createNotification(
      userId,
      'bolsillo_actualizado',
      'Bolsillo Actualizado',
      `Bolsillo "${data.nombre}" actualizado. Cupo: $${data.limite.toLocaleString('es-CO')}.`
    );

    return updatedPocket;
  }

  /**
   * Delete a pocket and return its remaining funds to the main card.
   */
  async deletePocket(userId: string, pocketId: string) {
    const card = await this.getOrCreateDebitCard(userId);
    const pocket = await prisma.bolsillo.findFirst({
      where: { id: pocketId, tarjetaDebitoId: card.id },
    });

    if (!pocket) {
      throw new Error('Bolsillo no encontrado.');
    }

    const remainingFunds = Number(pocket.limite || 0) - Number(pocket.saldoUsado);

    await prisma.$transaction(async (tx) => {
      if (remainingFunds > 0) {
        await this.adjustBalances(tx, userId, card.id, remainingFunds);
      }
      await tx.bolsillo.delete({ where: { id: pocketId } });
    });

    await notificationService.createNotification(
      userId,
      'bolsillo_eliminado',
      'Bolsillo Eliminado',
      `El bolsillo "${pocket.nombre}" fue eliminado y se devolvieron $${remainingFunds.toLocaleString('es-CO')} a tu cuenta principal.`
    );

    return { success: true };
  }

  /**
   * Perform transaction, calculating 4x1000 GMF tax when applicable.
   */
  async recordTransaction(
    userId: string,
    data: {
      amount: number;
      bolsilloId?: string;
      tipo: string;
    }
  ) {
    const tipo = normalizeTipo(data.tipo);
    const card = await this.getOrCreateDebitCard(userId);

    if (data.bolsilloId) {
      const pocket = await prisma.bolsillo.findFirst({
        where: { id: data.bolsilloId, tarjetaDebitoId: card.id },
      });

      if (!pocket) throw new Error('Bolsillo no encontrado.');

      const balancePocket = Number(pocket.limite || 0) - Number(pocket.saldoUsado);
      if (balancePocket < data.amount) {
        throw new Error('Saldo insuficiente en el bolsillo.');
      }

      return prisma.$transaction(async (tx) => {
        await tx.bolsillo.update({
          where: { id: data.bolsilloId },
          data: { saldoUsado: Number(pocket.saldoUsado) + data.amount },
        });

        return tx.transaccionDebito.create({
          data: {
            tarjetaDebitoId: card.id,
            bolsilloId: data.bolsilloId,
            tipo,
            monto: data.amount,
            gmf: 0,
            montoTotalDebitado: data.amount,
          },
        });
      });
    }

    const currentMonth = new Date().getMonth() + 1;
    let acumulado = Number(card.acumuladoGmfMes);
    if (card.mesAcumulado !== currentMonth) {
      acumulado = 0;
    }

    let gmf = 0;
    if (TAXABLE_TIPOS.has(tipo)) {
      const totalExcludingTax = acumulado + data.amount;
      if (totalExcludingTax > GMF_THRESHOLD) {
        const alreadyTaxed = Math.max(0, acumulado - GMF_THRESHOLD);
        const taxableAmount = Math.max(0, totalExcludingTax - GMF_THRESHOLD - alreadyTaxed);
        gmf = taxableAmount * GMF_RATE;
      }
    }

    const totalDebited = data.amount + gmf;
    if (Number(card.saldo) < totalDebited) {
      throw new Error(
        `Saldo insuficiente. Monto: $${data.amount.toLocaleString('es-CO')}` +
          (gmf > 0 ? ` + GMF 4x1000: $${gmf.toLocaleString('es-CO')}` : '') +
          '.'
      );
    }

    const isDeposit = tipo === 'deposito';
    const balanceDelta = isDeposit ? data.amount : -totalDebited;

    const trans = await prisma.$transaction(async (tx) => {
      await this.adjustBalances(tx, userId, card.id, balanceDelta);

      await tx.tarjetaDebito.update({
        where: { id: card.id },
        data: {
          acumuladoGmfMes: isDeposit ? acumulado : acumulado + data.amount,
          mesAcumulado: currentMonth,
        },
      });

      return tx.transaccionDebito.create({
        data: {
          tarjetaDebitoId: card.id,
          tipo,
          monto: data.amount,
          gmf: isDeposit ? 0 : gmf,
          montoTotalDebitado: isDeposit ? data.amount : totalDebited,
        },
      });
    });

    const notifTipo =
      tipo === 'deposito'
        ? 'deposito_realizado'
        : tipo === 'retiro'
          ? 'retiro_realizado'
          : tipo === 'transferencia'
            ? 'transferencia_realizada'
            : 'debito_transaccion';

    await notificationService.createNotification(
      userId,
      notifTipo,
      'Transacción de Débito',
      isDeposit
        ? `Depósito de $${data.amount.toLocaleString('es-CO')} acreditado.`
        : `Debitado: $${data.amount.toLocaleString('es-CO')}${gmf > 0 ? ` + GMF 4x1000: $${gmf.toLocaleString('es-CO')}` : ''}.`
    );

    return trans;
  }
}

export default DebitCardService;
