import { Router } from 'express';
import { validate } from '../../core/middlewares/validate';
import { authMiddleware } from '../../core/middlewares/auth';
import { requireOwnerContext } from '../../core/middlewares/ownerContext';
import { requireRole } from '../../core/middlewares/rbac';
import {
  listRulesHandler,
  createRuleHandler,
  updateRuleHandler,
  deleteRuleHandler,
  getPendingRulesHandler,
  confirmRuleHandler,
} from './recurring.controller';
import { createRecurringRuleSchema, updateRecurringRuleSchema } from './recurring.schema';

const router = Router();

router.get('/', authMiddleware, requireOwnerContext, listRulesHandler);

router.post(
  '/',
  authMiddleware,
  requireOwnerContext,
  requireRole('OWNER', 'SUPERVISOR'),
  validate(createRecurringRuleSchema),
  createRuleHandler,
);

router.get('/pending', authMiddleware, requireOwnerContext, getPendingRulesHandler);

router.put(
  '/:id',
  authMiddleware,
  requireOwnerContext,
  requireRole('OWNER', 'SUPERVISOR'),
  validate(updateRecurringRuleSchema),
  updateRuleHandler,
);

router.delete(
  '/:id',
  authMiddleware,
  requireOwnerContext,
  requireRole('OWNER', 'SUPERVISOR'),
  deleteRuleHandler,
);

router.post(
  '/:id/confirm',
  authMiddleware,
  requireOwnerContext,
  requireRole('OWNER', 'SUPERVISOR'),
  confirmRuleHandler,
);

export default router;
