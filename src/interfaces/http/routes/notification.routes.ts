import express from 'express';
import { authenticate } from '../../../modules/auth/middlewares/auth.middleware';
import controller from '../controllers/notification.controller';

const router = express.Router();

router.get('/', authenticate, controller.listNotifications);
router.patch('/:id/leida', authenticate, controller.markAsRead);
router.delete('/:id', authenticate, controller.deleteNotification);

export default router;
