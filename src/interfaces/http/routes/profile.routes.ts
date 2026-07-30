import express from 'express';
import { authenticate } from '../../../modules/auth/middlewares/auth.middleware';
import controller from '../controllers/profile.controller';

const router = express.Router();

router.get('/', authenticate, controller.getProfile);
router.put('/', authenticate, controller.updateProfile);
router.put('/password', authenticate, controller.changePassword);

export default router;
