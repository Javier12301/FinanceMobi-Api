import { Router } from 'express';
import { authMiddleware } from '../../core/middlewares/auth';
import { statsController, checkInController } from './stats.controller';

const router = Router();
router.get('/me/stats', authMiddleware, statsController);
router.post('/me/check-in', authMiddleware, checkInController);
export default router;
