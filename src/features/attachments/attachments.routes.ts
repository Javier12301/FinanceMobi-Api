import { Router } from 'express';
import multer from 'multer';
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
const upload = multer({ storage: multer.memoryStorage() });

router.post('/drive/connect', authMiddleware, requireOwnerContext, connectDriveHandler);

router.post(
  '/transactions/:transactionId/attachments',
  authMiddleware,
  requireOwnerContext,
  requireRole('OWNER', 'SUPERVISOR'),
  upload.single('file'),
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
