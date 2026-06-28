import { Router } from 'express';
import { validate } from '../../core/middlewares/validate';
import { authMiddleware } from '../../core/middlewares/auth';
import { requireOwnerContext } from '../../core/middlewares/ownerContext';
import { requireRole } from '../../core/middlewares/rbac';
import {
  createTransactionHandler,
  listTransactionsHandler,
  updateTransactionHandler,
  deleteTransactionHandler,
} from './transactions.controller';
import { createTransactionSchema, updateTransactionSchema, listTransactionFiltersSchema } from './transactions.schema';

const router = Router();

router.post(
  '/',
  authMiddleware,
  requireOwnerContext,
  requireRole('OWNER', 'SUPERVISOR'),
  validate(createTransactionSchema),
  createTransactionHandler,
);

router.get('/', authMiddleware, requireOwnerContext, listTransactionsHandler);

router.put(
  '/:transactionId',
  authMiddleware,
  requireOwnerContext,
  requireRole('OWNER', 'SUPERVISOR'),
  validate(updateTransactionSchema),
  updateTransactionHandler,
);

router.delete(
  '/:transactionId',
  authMiddleware,
  requireOwnerContext,
  requireRole('OWNER', 'SUPERVISOR'),
  deleteTransactionHandler,
);

export default router;
