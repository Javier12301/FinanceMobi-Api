import { NextFunction, Request, Response } from 'express';
import { prisma } from '../database/prisma';
import { AppError } from '../errors';

type ResourceModel = 'wallet' | 'transaction' | 'transactionAttachment';

export function ownershipGuard(model: ResourceModel, idParam: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const ownerContext = req.ownerContext;

      if (!ownerContext) {
        throw new AppError(403, 'Acceso denegado.');
      }

      const resourceId = req.params[idParam];

      if (!resourceId) {
        throw new AppError(400, 'ID de recurso requerido.');
      }

      // Buscar el recurso
      const resource = await (prisma as any)[model].findUnique({
        where: { id: resourceId },
      });

      if (!resource) {
        throw new AppError(403, 'Acceso denegado.');
      }

      // Verificar ownership
      // Los recursos tienen un campo ownerId o userId según el modelo
      const ownerField = 'ownerId' in resource ? 'ownerId' : 'userId';
      const resourceOwnerId = (resource as any)[ownerField];

      if (resourceOwnerId !== ownerContext.ownerId) {
        throw new AppError(403, 'Acceso denegado.');
      }

      next();
    } catch (err) {
      next(err instanceof AppError ? err : new AppError(500, 'Error interno'));
    }
  };
}
