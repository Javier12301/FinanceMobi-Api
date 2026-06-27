import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../errors';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.message });
    return;
  }

  // Log unexpected errors without leaking internals to the client
  (req as Request & { log?: { error: (msg: string, err: unknown) => void } }).log?.error(
    'Unhandled error',
    err,
  ) ?? console.error('Unhandled error', err);

  res.status(500).json({ error: 'Internal server error' });
}
