import { Router } from 'express';
import { validate } from '../../core/middlewares/validate';
import { authMiddleware } from '../../core/middlewares/auth';
import { requireOwnerContext } from '../../core/middlewares/ownerContext';
import { requireRole } from '../../core/middlewares/rbac';
import { ownershipGuard } from '../../core/middlewares/ownershipGuard';
import { createWallet, listWallets, updateWallet, deleteWallet } from './wallets.controller';
import { createWalletSchema, updateWalletSchema } from './wallets.schema';

const router = Router();

router.post('/', authMiddleware, requireOwnerContext, requireRole('OWNER', 'SUPERVISOR'), validate(createWalletSchema), createWallet);
router.get('/', authMiddleware, requireOwnerContext, listWallets);
router.put('/:walletId', authMiddleware, requireOwnerContext, requireRole('OWNER', 'SUPERVISOR'), ownershipGuard('wallet', 'walletId'), validate(updateWalletSchema), updateWallet);
router.delete('/:walletId', authMiddleware, requireOwnerContext, requireRole('OWNER', 'SUPERVISOR'), ownershipGuard('wallet', 'walletId'), deleteWallet);

export default router;
