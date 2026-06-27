import { Router } from 'express';
import { authMiddleware } from '../../core/middlewares/auth';
import { requireOwnerContext } from '../../core/middlewares/ownerContext';
import { requireRole } from '../../core/middlewares/rbac';
import {
  connectDriveHandler,
  uploadAttachmentHandler,
  listAttachmentsHandler,
  deleteAttachmentHandler
} from './attachments.controller';

const router = Router();

router.post('/drive/connect', authMiddleware, requireOwnerContext, connectDriveHandler);

// ponytail: multer removido hasta que política de MIME/tamaño sea aprobada (Fix 5+6)
router.post(
  '/transactions/:transactionId/attachments',
  authMiddleware,
  requireOwnerContext,
  requireRole('OWNER', 'SUPERVISOR'),
  uploadAttachmentHandler,
);

router.get(
  '/transactions/:transactionId/attachments',
  authMiddleware,
  requireOwnerContext,
  listAttachmentsHandler,
);

router.delete(
  '/transactions/:transactionId/attachments/:attachmentId',
  authMiddleware,
  requireOwnerContext,
  requireRole('OWNER', 'SUPERVISOR'),
  deleteAttachmentHandler,
);

export default router;
