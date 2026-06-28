import { Router } from 'express';
import { authMiddleware } from '../../core/middlewares/auth';
import { requireOwnerContext } from '../../core/middlewares/ownerContext';
import { requireRole } from '../../core/middlewares/rbac';
import { validate } from '../../core/middlewares/validate';
import { listBudgets, createBudget, updateBudget, deleteBudget } from './budgets.controller';
import { createBudgetSchema, updateBudgetSchema } from './budgets.schema';

const router = Router();

router.get('/', authMiddleware, requireOwnerContext, listBudgets);
router.post('/', authMiddleware, requireOwnerContext, requireRole('OWNER', 'SUPERVISOR'), validate(createBudgetSchema), createBudget);
router.put('/:id', authMiddleware, requireOwnerContext, requireRole('OWNER', 'SUPERVISOR'), validate(updateBudgetSchema), updateBudget);
router.delete('/:id', authMiddleware, requireOwnerContext, requireRole('OWNER', 'SUPERVISOR'), deleteBudget);

export default router;
