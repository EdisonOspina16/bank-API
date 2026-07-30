import { Request, Response } from 'express';
import { NotificationService } from '../../../modules/notifications/services/notification.service';

const notificationService = new NotificationService();

export async function listNotifications(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  try {
    const notifications = await notificationService.getNotifications(userId);
    return res.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        tipo: n.tipo || 'info',
        titulo: n.title,
        mensaje: n.mensaje || n.body,
        leida: n.leida || n.isRead,
        createdAt: n.createdAt,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error al listar las notificaciones.' });
  }
}

export async function markAsRead(req: Request, res: Response) {
  const userId = req.userId;
  const id = String(req.params.id);

  if (!userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  try {
    await notificationService.markAsRead(id, userId);
    return res.json({ success: true, message: 'Notificación marcada como leída.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Error al actualizar la notificación.' });
  }
}

export async function deleteNotification(req: Request, res: Response) {
  const userId = req.userId;
  const id = String(req.params.id);

  if (!userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  try {
    await notificationService.deleteNotification(id, userId);
    return res.json({ success: true, message: 'Notificación eliminada con éxito.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Error al eliminar la notificación.' });
  }
}

export default { listNotifications, markAsRead, deleteNotification };
