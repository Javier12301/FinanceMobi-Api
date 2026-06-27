import { Request, Response, NextFunction } from 'express';
import { connectDrive, uploadAttachment, listAttachments, deleteAttachment } from './attachments.service';
import { AppError } from '../../core/errors';

export async function connectDriveHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    await connectDrive(req.user!.sub, refreshToken);
    res.status(200).json({ message: 'Google Drive conectado' });
  } catch (err) {
    next(err);
  }
}

export async function uploadAttachmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { transactionId } = req.params;
    const files = (req.files as any[]) || [];
    const attachments = await uploadAttachment(transactionId, req.ownerContext!.ownerId, files);
    res.status(201).json(attachments);
  } catch (err) {
    next(err);
  }
}

export async function listAttachmentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { transactionId } = req.params;
    const attachments = await listAttachments(transactionId, req.ownerContext!);
    res.json(attachments);
  } catch (err) {
    next(err);
  }
}

export async function deleteAttachmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { transactionId, attachmentId } = req.params;
    await deleteAttachment(attachmentId, transactionId, req.ownerContext!.ownerId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
