import type { NextFunction, Request, Response } from 'express';
import { resetAccounting } from './accounting.service';
import type { ResetAccountingInput } from './accounting.schema';

export async function resetAccountingHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await resetAccounting(req.ownerContext!.ownerId, req.user!.sub, req.body as ResetAccountingInput));
  } catch (error) {
    next(error);
  }
}
