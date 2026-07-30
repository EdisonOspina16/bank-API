import express from 'express';
import { authenticate } from '../../../modules/auth/middlewares/auth.middleware';
import transferController from '../controllers/transfer.controller';

const router = express.Router();

router.get('/lookup', authenticate, transferController.lookupRecipient);
router.post('/', authenticate, transferController.createTransfer);

export default router;
