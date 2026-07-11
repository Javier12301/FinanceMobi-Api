import { Router } from 'express';
import { authMiddleware } from '../../core/middlewares/auth';
import { requireOwnerContext } from '../../core/middlewares/ownerContext';
import { validate } from '../../core/middlewares/validate';
import { resetAccountingHandler } from './accounting.controller';
import { resetAccountingSchema } from './accounting.schema';

const router = Router();
router.post('/reset', authMiddleware, requireOwnerContext, validate(resetAccountingSchema), resetAccountingHandler);
export default router;
