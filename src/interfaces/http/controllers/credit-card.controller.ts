import { Request, Response } from 'express';
import { CreditCardService } from '../../../modules/cards/services/credit-card.service';

const creditCardService = new CreditCardService();

export async function listCards(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  try {
    const cards = await creditCardService.getCards(userId);
    return res.json({
      cards: cards.map((c) => ({
        id: c.id,
        productoId: c.productoId,
        estado: c.estado,
        cupoAsignado: Number(c.cupoAsignado),
        gastado: Number(c.gastado),
        numero: c.numero,
        cvv: c.cvv,
        vence: c.vence,
        createdAt: c.createdAt,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error al obtener tarjetas.' });
  }
}

export async function applyCard(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  const {
    productoId,
    nombre,
    fechaNacimiento,
    cedulaNumero,
    ciudad,
    ocupacion,
    ingresos,
    urlDocumentoCedula,
    urlDocumentoIngresos,
  } = req.body;

  if (!productoId || !nombre || !fechaNacimiento || !cedulaNumero || !ciudad || !ocupacion || ingresos === undefined) {
    return res.status(400).json({ error: 'Todos los datos de la solicitud son obligatorios.' });
  }

  try {
    const result = await creditCardService.evaluarSolicitudTarjeta(userId, {
      productoId,
      nombre,
      fechaNacimiento,
      cedulaNumero,
      ciudad,
      ocupacion,
      ingresos: Number(ingresos),
      urlDocumentoCedula,
      urlDocumentoIngresos,
    });

    if (result.aprobada) {
      return res.json({
        success: true,
        aprobada: true,
        tarjeta: {
          id: result.tarjeta?.id,
          productoId: result.tarjeta?.productoId,
          cupoAsignado: Number(result.tarjeta?.cupoAsignado),
          gastado: Number(result.tarjeta?.gastado),
          numero: result.tarjeta?.numero,
          cvv: result.tarjeta?.cvv,
          vence: result.tarjeta?.vence,
        },
      });
    } else {
      return res.json({
        success: true,
        aprobada: false,
        motivo: result.motivo,
      });
    }
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Error al procesar la solicitud.' });
  }
}

export async function recordExpense(req: Request, res: Response) {
  const userId = req.userId;
  const cardId = String(req.params.id);
  const { amount } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  if (amount === undefined || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Monto de gasto no válido.' });
  }

  try {
    const card = await creditCardService.recordExpense(cardId, userId, Number(amount));
    return res.json({
      success: true,
      tarjeta: {
        id: card.id,
        productoId: card.productoId,
        cupoAsignado: Number(card.cupoAsignado),
        gastado: Number(card.gastado),
        numero: card.numero,
        cvv: card.cvv,
        vence: card.vence,
      },
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Error al registrar el gasto.' });
  }
}

export async function cancelCard(req: Request, res: Response) {
  const userId = req.userId;
  const cardId = String(req.params.id);

  if (!userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  try {
    await creditCardService.cancelCard(cardId, userId);
    return res.json({ success: true, message: 'Tarjeta cancelada con éxito.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Error al cancelar la tarjeta.' });
  }
}

export async function uploadFile(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  const { file, fileName, fileType, documentKind } = req.body;

  if (!file || !fileName || !fileType) {
    return res.status(400).json({ error: 'El archivo, nombre y tipo son obligatorios.' });
  }

  const kind =
    documentKind === 'ingresos' || documentKind === 'comprobante' || documentKind === 'cedula'
      ? documentKind
      : 'cedula';

  try {
    const url = await creditCardService.uploadFile(file, fileName, fileType, kind);
    return res.json({ success: true, url });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error al subir el archivo.' });
  }
}

export default { listCards, applyCard, recordExpense, cancelCard, uploadFile };
