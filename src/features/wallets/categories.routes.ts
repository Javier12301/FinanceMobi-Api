import { Router } from 'express';
import { validate } from '../../core/middlewares/validate';
import { authMiddleware } from '../../core/middlewares/auth';
import { requireOwnerContext } from '../../core/middlewares/ownerContext';
import { requireRole } from '../../core/middlewares/rbac';
import { createCategory, listCategories, listWalletTypes } from './categories.controller';
import { createCategorySchema } from './wallets.schema';

const router = Router();

router.post('/categories', authMiddleware, requireOwnerContext, requireRole('OWNER', 'SUPERVISOR'), validate(createCategorySchema), createCategory);
router.get('/categories', authMiddleware, requireOwnerContext, listCategories);
router.get('/wallet-types', listWalletTypes);

export default router;
