import express from 'express';
import { authenticate } from '../../../modules/auth/middlewares/auth.middleware';
import controller from '../controllers/credit-card.controller';

const router = express.Router();

router.get('/', authenticate, controller.listCards);
router.post('/solicitar', authenticate, controller.applyCard);
router.post('/upload', authenticate, controller.uploadFile);
router.post('/:id/gasto', authenticate, controller.recordExpense);
router.post('/:id/cancelar', authenticate, controller.cancelCard);

export default router;
