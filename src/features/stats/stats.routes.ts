import { Router } from 'express';
import { authMiddleware } from '../../core/middlewares/auth';
import { statsController } from './stats.controller';

const router = Router();
router.get('/me/stats', authMiddleware, statsController);
export default router;
