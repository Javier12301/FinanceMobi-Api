import { Request, Response, NextFunction } from 'express';
import { getDelegations, createDelegation, revokeDelegation } from './delegation.service';
import { AppError } from '../../core/errors';

export async function getDelegationsController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'No autenticado');
    const result = await getDelegations(req.user.sub);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function createDelegationController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'No autenticado');
    const delegation = await createDelegation(req.user.sub, req.body.email, req.body.role);
    res.status(201).json(delegation);
  } catch (err) {
    next(err);
  }
}

export async function revokeDelegationController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'No autenticado');
    await revokeDelegation(req.params.id, req.user.sub);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
