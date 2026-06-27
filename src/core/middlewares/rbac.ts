import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors';

type DelegationRole = 'OWNER' | 'SUPERVISOR' | 'ASESOR';

export function requireRole(...allowedRoles: DelegationRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const ownerContext = req.ownerContext;

      if (!ownerContext) {
        throw new AppError(403, 'Acceso denegado.');
      }

      // ASESOR no puede escribir
      const isMutationMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      if (ownerContext.role === 'ASESOR' && isMutationMethod) {
        throw new AppError(403, 'Acceso denegado.');
      }

      // Verificar que el rol esté en los permitidos
      if (!allowedRoles.includes(ownerContext.role)) {
        throw new AppError(403, 'Acceso denegado.');
      }

      next();
    } catch (err) {
      next(err instanceof AppError ? err : new AppError(500, 'Error interno'));
    }
  };
}
