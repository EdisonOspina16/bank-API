import prisma from '../../../infrastructure/database/prisma-client';
import { NotificationService } from '../../notifications/services/notification.service';

const notificationService = new NotificationService();

const OCUPACIONES_VALIDAS = ['empleado', 'independiente', 'pensionado', 'otro'] as const;

function normalizeOcupacion(value: string): string {
  const normalized = value.trim().toLowerCase();
  return (OCUPACIONES_VALIDAS as readonly string[]).includes(normalized)
    ? normalized
    : 'otro';
}

/** Product rules from business requirements (not user data). */
const PRODUCTOS: Record<
  string,
  { minIncome: number; cupoAsignado: number; franchise: 'VISA' | 'MASTERCARD' }
> = {
  clasica: { minIncome: 800_000, cupoAsignado: 3_000_000, franchise: 'VISA' },
  oro: { minIncome: 2_600_000, cupoAsignado: 9_000_000, franchise: 'MASTERCARD' },
  platinum: { minIncome: 6_000_000, cupoAsignado: 25_000_000, franchise: 'MASTERCARD' },
};

export class CreditCardService {
  /**
   * Evaluate a credit card application based on business rules.
   */
  async evaluarSolicitudTarjeta(
    userId: string,
    data: {
      productoId: string;
      nombre: string;
      fechaNacimiento: string;
      cedulaNumero: string;
      ciudad: string;
      ocupacion: string;
      ingresos: number;
      urlDocumentoCedula?: string;
      urlDocumentoIngresos?: string;
    }
  ) {
    const product = PRODUCTOS[data.productoId];
    if (!product) {
      throw new Error('Producto de tarjeta no válido.');
    }

    // Prevent duplicate active credit cards
    const existingActive = await prisma.tarjetaCredito.findFirst({
      where: { usuarioId: userId, estado: 'aprobada' },
    });
    if (existingActive) {
      throw new Error('Ya tienes una tarjeta de crédito activa. Cancélala antes de solicitar otra.');
    }

    const [day, month, year] = data.fechaNacimiento.split('/').map(Number);
    if (!day || !month || !year) {
      throw new Error('Fecha de nacimiento inválida. Usa el formato DD/MM/AAAA.');
    }
    const birthDate = new Date(year, month - 1, day);
    if (Number.isNaN(birthDate.getTime())) {
      throw new Error('Fecha de nacimiento inválida.');
    }

    const parts = data.nombre.trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';
    const ocupacion = normalizeOcupacion(data.ocupacion);
    const ingresos = Number(data.ingresos) || 0;

    await prisma.customerProfile.update({
      where: { userId },
      data: {
        firstName,
        lastName,
        birthDate,
        docNumber: data.cedulaNumero,
        ciudad: data.ciudad || '',
        ocupacion,
        ingresosMensuales: ingresos,
      },
    });

    // Age check (18-69)
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < 18 || age > 69) {
      const reason = `Edad fuera del rango permitido de 18 a 69 años. Edad detectada: ${age} años.`;
      await this.saveSolicitudRechazada(userId, data, reason, age);
      return { aprobada: false, motivo: reason };
    }

    if (ingresos < product.minIncome) {
      const reason = `Los ingresos mensuales de $${ingresos.toLocaleString('es-CO')} no cumplen con el mínimo requerido para este producto ($${product.minIncome.toLocaleString('es-CO')}).`;
      await this.saveSolicitudRechazada(userId, data, reason, 700);
      return { aprobada: false, motivo: reason };
    }

    // Simulated risk score (300-850), deterministic-ish from income + doc to avoid pure randomness flapping
    const docSeed = Number(String(data.cedulaNumero).replace(/\D/g, '').slice(-4)) || 500;
    const baseScore = ingresos > 5_000_000 ? 650 : 550;
    const scoreSimulado = Math.min(850, Math.max(300, baseScore + (docSeed % 200)));

    if (scoreSimulado < 600) {
      const reason = `Tu puntaje de crédito simulado en centrales de riesgo (${scoreSimulado} puntos) es insuficiente (mínimo requerido: 600 puntos).`;
      await this.saveSolicitudRechazada(userId, data, reason, scoreSimulado);
      return { aprobada: false, motivo: reason };
    }

    const cuotaEstimada = product.cupoAsignado * 0.045;
    if (cuotaEstimada > ingresos * 0.35) {
      const reason = `La cuota mensual estimada de esta tarjeta ($${cuotaEstimada.toLocaleString('es-CO')}) excede el 35% de tus ingresos declarados.`;
      await this.saveSolicitudRechazada(userId, data, reason, scoreSimulado);
      return { aprobada: false, motivo: reason };
    }

    const prefix = product.franchise === 'VISA' ? '4' : '5';
    let numero = prefix;
    for (let i = 0; i < 15; i++) {
      numero += Math.floor(Math.random() * 10).toString();
    }
    const formattedNumero = numero.match(/.{1,4}/g)?.join(' ') || numero;
    const cvv = Math.floor(100 + Math.random() * 900).toString();
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 5);
    const vence = `${String(expiry.getMonth() + 1).padStart(2, '0')}/${String(expiry.getFullYear()).slice(-2)}`;

    const card = await prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudCredito.create({
        data: {
          usuarioId: userId,
          productoId: data.productoId,
          datosEnviados: {
            ingresos,
            age,
            scoreSimulado,
            ciudad: data.ciudad,
            ocupacion,
          } as any,
          urlDocumentoCedula: data.urlDocumentoCedula || null,
          urlDocumentoIngresos: data.urlDocumentoIngresos || null,
          aprobada: true,
          motivo: 'Aprobación automática por cumplimiento de políticas de riesgo.',
          scoreSimulado,
        },
      });

      return tx.tarjetaCredito.create({
        data: {
          usuarioId: userId,
          solicitudId: solicitud.id,
          productoId: data.productoId,
          estado: 'aprobada',
          cupoAsignado: product.cupoAsignado,
          gastado: 0,
          numero: formattedNumero,
          cvv,
          vence,
        },
      });
    });

    await notificationService.createNotification(
      userId,
      'tarjeta_credito_aprobada',
      '¡Tarjeta de Crédito Aprobada!',
      `Felicidades, tu solicitud de tarjeta ${data.productoId.toUpperCase()} ha sido aprobada con un cupo de $${product.cupoAsignado.toLocaleString('es-CO')}.`
    );

    return { aprobada: true, tarjeta: card };
  }

  private async saveSolicitudRechazada(
    userId: string,
    data: {
      productoId: string;
      urlDocumentoCedula?: string;
      urlDocumentoIngresos?: string;
      ingresos?: number;
      ciudad?: string;
      ocupacion?: string;
    },
    reason: string,
    scoreSimulado: number
  ) {
    await prisma.solicitudCredito.create({
      data: {
        usuarioId: userId,
        productoId: data.productoId,
        datosEnviados: { reason, ingresos: data.ingresos } as any,
        urlDocumentoCedula: data.urlDocumentoCedula || null,
        urlDocumentoIngresos: data.urlDocumentoIngresos || null,
        aprobada: false,
        motivo: reason,
        scoreSimulado,
      },
    });

    await notificationService.createNotification(
      userId,
      'tarjeta_credito_rechazada',
      'Solicitud de Tarjeta Rechazada',
      `Tu solicitud para la tarjeta ${data.productoId.toUpperCase()} no pudo ser aprobada. Motivo: ${reason}`
    );
  }

  async getCards(userId: string) {
    return prisma.tarjetaCredito.findMany({
      where: { usuarioId: userId, estado: { not: 'cancelada' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Record card expense — updates gastado; disponible = cupoAsignado - gastado.
   */
  async recordExpense(cardId: string, userId: string, amount: number) {
    const card = await prisma.tarjetaCredito.findFirst({
      where: { id: cardId, usuarioId: userId },
    });

    if (!card) {
      throw new Error('Tarjeta de crédito no encontrada.');
    }

    if (card.estado !== 'aprobada') {
      throw new Error('La tarjeta no está activa para compras.');
    }

    const gastado = Number(card.gastado);
    const cupo = Number(card.cupoAsignado);

    if (gastado + amount > cupo) {
      throw new Error('Cupo insuficiente en la tarjeta de crédito.');
    }

    const updatedCard = await prisma.tarjetaCredito.update({
      where: { id: cardId },
      data: { gastado: gastado + amount },
    });

    await notificationService.createNotification(
      userId,
      'pago_tarjeta_credito',
      'Compra con Tarjeta de Crédito',
      `Has registrado una compra por $${amount.toLocaleString('es-CO')}. Disponible: $${(cupo - gastado - amount).toLocaleString('es-CO')}.`
    );

    return updatedCard;
  }

  async cancelCard(cardId: string, userId: string) {
    const card = await prisma.tarjetaCredito.findFirst({
      where: { id: cardId, usuarioId: userId },
    });

    if (!card) {
      throw new Error('Tarjeta de crédito no encontrada.');
    }

    const updatedCard = await prisma.tarjetaCredito.update({
      where: { id: cardId },
      data: { estado: 'cancelada' },
    });

    await notificationService.createNotification(
      userId,
      'tarjeta_credito_cancelada',
      'Tarjeta Cancelada',
      `Tu tarjeta de crédito terminada en ${card.numero.slice(-4)} ha sido cancelada con éxito.`
    );

    return updatedCard;
  }

  /**
   * Upload a base64 file to Supabase Storage via S3-compatible API.
   * Uses: SUPABASE_S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION
   * Buckets: S3_BUCKET_CEDULA | S3_BUCKET_INGRESOS
   */
  async uploadFile(
    base64Data: string,
    fileName: string,
    fileType: string,
    documentKind: 'cedula' | 'ingresos' | 'comprobante' = 'cedula'
  ): Promise<string> {
    const endpoint = stripQuotes(process.env.SUPABASE_S3_ENDPOINT);
    const accessKeyId = stripQuotes(process.env.S3_ACCESS_KEY_ID);
    const secretAccessKey = stripQuotes(process.env.S3_SECRET_ACCESS_KEY);
    const region = stripQuotes(process.env.S3_REGION) || 'ca-central-1';
    const publicBase = stripQuotes(process.env.SUPABASE_STORAGE_PUBLIC_URL).replace(/\/$/, '');

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'Faltan credenciales S3 de Supabase. Configura SUPABASE_S3_ENDPOINT, S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY en el .env del backend.'
      );
    }

    const isIngresos = documentKind === 'ingresos' || documentKind === 'comprobante';
    const bucket =
      stripQuotes(
        isIngresos
          ? process.env.S3_BUCKET_INGRESOS || process.env.S3_BUCKET_NAME
          : process.env.S3_BUCKET_CEDULA || process.env.S3_BUCKET_NAME
      ) || (isIngresos ? 'Ingresos' : 'cedula');

    const key = `${Date.now()}_${fileName.replace(/\s+/g, '_')}`;
    const cleanBase64 = base64Data.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      forcePathStyle: true,
      region,
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: fileType || 'application/octet-stream',
        })
      );
    } catch (e: any) {
      throw new Error(
        `Error al subir documento a Supabase S3 (${bucket}): ${e?.message || e}`
      );
    }

    if (!publicBase) {
      throw new Error(
        'Falta SUPABASE_STORAGE_PUBLIC_URL en el .env para devolver la URL pública del archivo.'
      );
    }

    return `${publicBase}/${bucket}/${key}`;
  }
}

function stripQuotes(value?: string | null): string {
  return (value || '').trim().replace(/^["']|["']$/g, '');
}

export default CreditCardService;
