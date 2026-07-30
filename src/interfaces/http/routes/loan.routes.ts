import express from 'express';
import { authenticate } from '../../../modules/auth/middlewares/auth.middleware';
import loanController from '../controllers/loan.controller';

const router = express.Router();

router.post('/', authenticate, loanController.requestDisbursement);

export default router;