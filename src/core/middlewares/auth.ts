import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../security/jwt';
import { redis } from '../database/redis';
import { AppError } from '../errors';

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'No autenticado');

    const token = header.slice(7);
    const payload = verifyToken(token);

    const sessionKey = `session:${payload.sub}:${payload.jti}`;
    const exists = await redis.exists(sessionKey);
    if (!exists) throw new AppError(401, 'Sesión revocada o expirada');

    req.user = payload;
    next();
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(401, 'Token inválido'));
  }
}
