import { Request, Response, NextFunction } from 'express';
import { getAuthUrl, connectDrive, uploadAttachment, listAttachments, deleteAttachment } from './attachments.service';
import { AppError } from '../../core/errors';

export async function getAuthUrlHandler(req: Request, res: Response, next: NextFunction) {
  try {
    // F4: Drive pertenece solo al owner autenticado, no a delegados
    if (req.user!.sub !== req.ownerContext!.ownerId) {
      throw new AppError(403, 'Solo el owner puede conectar Google Drive');
    }
    res.json(await getAuthUrl(req.user!.sub));
  } catch (err) {
    next(err);
  }
}

export async function connectDriveHandler(req: Request, res: Response, next: NextFunction) {
  try {
    // F4: Drive pertenece solo al owner autenticado, no a delegados
    if (req.user!.sub !== req.ownerContext!.ownerId) {
      throw new AppError(403, 'Solo el owner puede conectar Google Drive');
    }
    const { code, state } = req.body;
    if (!code) throw new AppError(400, 'code es requerido');
    if (!state) throw new AppError(400, 'state es requerido');
    await connectDrive(req.user!.sub, code, state);
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
