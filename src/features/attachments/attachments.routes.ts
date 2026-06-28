import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../core/middlewares/auth';
import { requireOwnerContext } from '../../core/middlewares/ownerContext';
import { requireRole } from '../../core/middlewares/rbac';
import { AppError } from '../../core/errors';
import {
  getAuthUrlHandler,
  connectDriveHandler,
  uploadAttachmentHandler,
  listAttachmentsHandler,
  deleteAttachmentHandler
} from './attachments.controller';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new AppError(400, `Tipo de archivo no permitido: ${file.mimetype}`));
  },
});

const router = Router();

router.get('/drive/auth-url', authMiddleware, requireOwnerContext, getAuthUrlHandler);
router.post('/drive/connect', authMiddleware, requireOwnerContext, connectDriveHandler);

router.post(
  '/transactions/:transactionId/attachments',
  authMiddleware,
  requireOwnerContext,
  requireRole('OWNER', 'SUPERVISOR'),
  upload.array('file', 3),
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
