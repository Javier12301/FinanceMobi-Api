import { Router } from 'express';
import { authMiddleware } from '../../core/middlewares/auth';
import { requireOwnerContext } from '../../core/middlewares/ownerContext';
import { requireRole } from '../../core/middlewares/rbac';
import { validate } from '../../core/middlewares/validate';
import {
  listGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  addContribution,
  deleteContribution,
} from './savings.controller';
import { createGoalSchema, updateGoalSchema, createContributionSchema } from './savings.schema';

const router = Router();

const write = [authMiddleware, requireOwnerContext, requireRole('OWNER', 'SUPERVISOR')] as const;

router.get('/', authMiddleware, requireOwnerContext, listGoals);
router.post('/', ...write, validate(createGoalSchema), createGoal);
router.put('/:goalId', ...write, validate(updateGoalSchema), updateGoal);
router.delete('/:goalId', ...write, deleteGoal);

// Aportes ("guardé $X para esta meta").
router.post('/:goalId/contributions', ...write, validate(createContributionSchema), addContribution);
router.delete('/:goalId/contributions/:contributionId', ...write, deleteContribution);

export default router;
