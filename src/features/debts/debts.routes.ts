import { Router } from 'express';
import { authMiddleware } from '../../core/middlewares/auth';
import { requireOwnerContext } from '../../core/middlewares/ownerContext';
import { requireRole } from '../../core/middlewares/rbac';
import { validate } from '../../core/middlewares/validate';
import { createDebtSchema, updateDebtSchema, payDebtSchema } from './debts.schema';
import {
  listDebtsController,
  createDebtController,
  updateDebtController,
  deleteDebtController,
  payDebtController,
} from './debts.controller';

const router = Router();
router.use(authMiddleware, requireOwnerContext);

router.get('/', listDebtsController);
router.post('/', requireRole('OWNER', 'SUPERVISOR'), validate(createDebtSchema), createDebtController);
router.put('/:id', requireRole('OWNER', 'SUPERVISOR'), validate(updateDebtSchema), updateDebtController);
router.delete('/:id', requireRole('OWNER', 'SUPERVISOR'), deleteDebtController);
router.post('/:id/pay', requireRole('OWNER', 'SUPERVISOR'), validate(payDebtSchema), payDebtController);

export default router;
