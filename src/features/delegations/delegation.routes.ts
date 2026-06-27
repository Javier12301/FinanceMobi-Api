import { Router } from 'express';
import { authMiddleware } from '../../core/middlewares/auth';
import { validate } from '../../core/middlewares/validate';
import { createDelegationSchema } from './delegation.schema';
import {
  getDelegationsController,
  createDelegationController,
  revokeDelegationController,
} from './delegation.controller';

const router = Router();

router.get('/', authMiddleware, getDelegationsController);
router.post('/', authMiddleware, validate(createDelegationSchema), createDelegationController);
router.delete('/:id', authMiddleware, revokeDelegationController);

export default router;
