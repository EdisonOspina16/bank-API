import express from 'express';
import { authenticate } from '../../../modules/auth/middlewares/auth.middleware';
import accountController from '../controllers/account.controller';

const router = express.Router();

router.get('/', authenticate, accountController.listAccounts);
router.post('/withdraw', authenticate, accountController.withdraw);
router.post('/deposit', authenticate, accountController.deposit);

export default router;
