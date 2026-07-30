import { Request, Response } from 'express';
import { DebitCardService } from '../../../modules/cards/services/debit-card.service';

const service = new DebitCardService();

export async function getCard(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'No autenticado.' });

  try {
    const [card, titular] = await Promise.all([
      service.getOrCreateDebitCard(userId),
      service.getTitularNombre(userId),
    ]);
    return res.json({
      success: true,
      card: {
        id: card.id,
        numero: card.numero,
        cvv: card.cvv,
        vence: card.vence,
        saldo: Number(card.saldo),
        titular,
        acumuladoGmfMes: Number(card.acumuladoGmfMes),
        bolsillos: card.bolsillos.map((b) => ({
          id: b.id,
          nombre: b.nombre,
          limite: Number(b.limite || 0),
          icono: b.icono,
          saldoUsado: Number(b.saldoUsado),
        })),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error al obtener la tarjeta débito.' });
  }
}

export async function getCvv(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'No autenticado.' });

  try {
    const data = await service.getCvv(userId);
    return res.json({ success: true, ...data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error al obtener CVV.' });
  }
}

export async function createPocket(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'No autenticado.' });

  const { nombre, limite, icono } = req.body;
  if (!nombre || limite === undefined || isNaN(limite) || limite <= 0) {
    return res.status(400).json({ error: 'Nombre y saldo/límite de bolsillo válidos requeridos.' });
  }

  try {
    const pocket = await service.createPocket(userId, {
      nombre,
      limite: Number(limite),
      icono,
    });
    return res.json({
      success: true,
      pocket: {
        id: pocket.id,
        nombre: pocket.nombre,
        limite: Number(pocket.limite || 0),
        icono: pocket.icono,
        saldoUsado: Number(pocket.saldoUsado),
      },
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Error al crear bolsillo.' });
  }
}

export async function updatePocket(req: Request, res: Response) {
  const userId = req.userId;
  const pocketId = String(req.params.pocketId);
  if (!userId) return res.status(401).json({ error: 'No autenticado.' });

  const { nombre, limite, icono } = req.body;
  if (!nombre || limite === undefined || isNaN(limite) || limite <= 0) {
    return res.status(400).json({ error: 'Nombre y saldo/límite de bolsillo válidos requeridos.' });
  }

  try {
    const pocket = await service.updatePocket(userId, pocketId, {
      nombre,
      limite: Number(limite),
      icono,
    });
    return res.json({
      success: true,
      pocket: {
        id: pocket.id,
        nombre: pocket.nombre,
        limite: Number(pocket.limite || 0),
        icono: pocket.icono,
        saldoUsado: Number(pocket.saldoUsado),
      },
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Error al actualizar bolsillo.' });
  }
}

export async function deletePocket(req: Request, res: Response) {
  const userId = req.userId;
  const pocketId = String(req.params.pocketId);
  if (!userId) return res.status(401).json({ error: 'No autenticado.' });

  try {
    await service.deletePocket(userId, pocketId);
    return res.json({ success: true, message: 'Bolsillo eliminado con éxito.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Error al eliminar bolsillo.' });
  }
}

export async function recordTransaction(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'No autenticado.' });

  const { amount, bolsilloId, tipo } = req.body;
  if (!amount || isNaN(amount) || amount <= 0 || !tipo) {
    return res.status(400).json({ error: 'Monto y tipo de transacción requeridos.' });
  }

  try {
    const trans = await service.recordTransaction(userId, {
      amount: Number(amount),
      bolsilloId,
      tipo,
    });
    return res.json({
      success: true,
      transaction: {
        id: trans.id,
        tipo: trans.tipo,
        monto: Number(trans.monto),
        gmf: Number(trans.gmf),
        montoTotalDebitado: Number(trans.montoTotalDebitado),
      },
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Error al registrar transacción.' });
  }
}

export default { getCard, getCvv, createPocket, updatePocket, deletePocket, recordTransaction };
