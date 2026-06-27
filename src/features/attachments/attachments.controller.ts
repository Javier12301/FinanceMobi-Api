import { Request, Response, NextFunction } from 'express';
import { connectDrive, uploadAttachment, listAttachments, deleteAttachment } from './attachments.service';

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
    if (!req.file) throw new Error('No file provided');

    const attachment = await uploadAttachment(transactionId, req.ownerContext!.ownerId, {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
    });

    res.status(201).json(attachment);
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
    const { attachmentId } = req.params;
    await deleteAttachment(attachmentId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
