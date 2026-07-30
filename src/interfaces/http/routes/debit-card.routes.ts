import express from 'express';
import { authenticate } from '../../../modules/auth/middlewares/auth.middleware';
import controller from '../controllers/debit-card.controller';

const router = express.Router();

router.get('/', authenticate, controller.getCard);
router.get('/cvv', authenticate, controller.getCvv);
router.post('/bolsillos', authenticate, controller.createPocket);
router.put('/bolsillos/:pocketId', authenticate, controller.updatePocket);
router.delete('/bolsillos/:pocketId', authenticate, controller.deletePocket);
router.post('/transaccion', authenticate, controller.recordTransaction);

export default router;
