import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../database/prisma';
import { AppError } from '../errors';

const uuidSchema = z.string().uuid();

export async function requireOwnerContext(req: Request, _res: Response, next: NextFunction) {
  try {
    const ownerIdHeader = req.headers['x-owner-id'];

    if (!ownerIdHeader) {
      throw new AppError(400, 'X-Owner-Id inválido.');
    }

    if (typeof ownerIdHeader !== 'string') {
      throw new AppError(400, 'X-Owner-Id inválido.');
    }

    // Validar que sea UUID
    const ownerIdResult = uuidSchema.safeParse(ownerIdHeader);
    if (!ownerIdResult.success) {
      throw new AppError(400, 'X-Owner-Id inválido.');
    }

    const ownerId = ownerIdResult.data;
    const requestUserId = req.user?.sub;

    if (!requestUserId) {
      throw new AppError(401, 'No autenticado');
    }

    // Si el usuario es el owner, acceso directo
    if (requestUserId === ownerId) {
      req.ownerContext = {
        ownerId,
        role: 'OWNER',
      };
      return next();
    }

    // Buscar delegación activa
    const delegation = await prisma.userDelegation.findFirst({
      where: {
        ownerId,
        delegatedUserId: requestUserId,
        active: true,
      },
    });

    if (!delegation) {
      throw new AppError(403, 'Acceso denegado.');
    }

    req.ownerContext = {
      ownerId,
      role: delegation.role,
    };

    next();
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(500, 'Error interno'));
  }
}
