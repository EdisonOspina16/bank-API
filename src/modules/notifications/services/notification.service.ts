import prisma from '../../../infrastructure/database/prisma-client';

export class NotificationService {
  /**
   * Create a new notification for a user.
   * Never throws to callers of business actions — logs and returns null on failure.
   */
  async createNotification(
    userId: string,
    tipo: string,
    titulo: string,
    mensaje: string
  ) {
    try {
      return await prisma.notification.create({
        data: {
          userId,
          title: titulo,
          body: mensaje,
          channel: 'PUSH',
          tipo,
          mensaje,
          leida: false,
          isRead: false,
        },
      });
    } catch (err: any) {
      console.error('[NotificationService] createNotification failed:', err?.message || err);
      return null;
    }
  }

  /**
   * Get all notifications for a user, ordered by creation date descending.
   */
  async getNotifications(userId: string) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Mark a notification as read.
   */
  async markAsRead(id: string, userId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new Error('Notificación no encontrada.');
    }

    return prisma.notification.update({
      where: { id },
      data: {
        leida: true,
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Delete a notification.
   */
  async deleteNotification(id: string, userId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new Error('Notificación no encontrada o no autorizada.');
    }

    return prisma.notification.delete({
      where: { id },
    });
  }
}

export default NotificationService;
