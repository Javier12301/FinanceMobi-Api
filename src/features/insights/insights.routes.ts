import { Router } from 'express';
import { authMiddleware } from '../../core/middlewares/auth';
import { requireOwnerContext } from '../../core/middlewares/ownerContext';
import { insightsController } from './insights.controller';

const router = Router();
router.get('/', authMiddleware, requireOwnerContext, insightsController);
export default router;
