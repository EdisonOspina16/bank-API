import express from 'express';
import { authenticate } from '../../../modules/auth/middlewares/auth.middleware';
import movementController from '../controllers/movement.controller';

const router = express.Router();

router.get('/', authenticate, movementController.listMovements);
router.get('/:id', authenticate, movementController.getMovementDetail);

export default router;
