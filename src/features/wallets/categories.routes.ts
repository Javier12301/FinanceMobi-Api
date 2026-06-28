import { Router } from 'express';
import { validate } from '../../core/middlewares/validate';
import { authMiddleware } from '../../core/middlewares/auth';
import { requireOwnerContext } from '../../core/middlewares/ownerContext';
import { requireRole } from '../../core/middlewares/rbac';
import { createCategory, listCategories, updateCategory, deleteCategory, listWalletTypes } from './categories.controller';
import { createCategorySchema, updateCategorySchema } from './wallets.schema';

const router = Router();

router.post('/categories', authMiddleware, requireOwnerContext, requireRole('OWNER', 'SUPERVISOR'), validate(createCategorySchema), createCategory);
router.get('/categories', authMiddleware, requireOwnerContext, listCategories);
router.put('/categories/:id', authMiddleware, requireOwnerContext, requireRole('OWNER', 'SUPERVISOR'), validate(updateCategorySchema), updateCategory);
router.delete('/categories/:id', authMiddleware, requireOwnerContext, requireRole('OWNER', 'SUPERVISOR'), deleteCategory);
router.get('/wallet-types', listWalletTypes);

export default router;
