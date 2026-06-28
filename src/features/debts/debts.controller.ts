import { NextFunction, Request, Response } from 'express';
import { listDebts, createDebt, updateDebt, deleteDebt, payDebt } from './debts.service';

export async function listDebtsController(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await listDebts(req.ownerContext!));
  } catch (err) { next(err); }
}

export async function createDebtController(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await createDebt(req.body, req.ownerContext!));
  } catch (err) { next(err); }
}

export async function updateDebtController(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await updateDebt(req.params.id, req.body, req.ownerContext!));
  } catch (err) { next(err); }
}

export async function deleteDebtController(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteDebt(req.params.id, req.ownerContext!);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function payDebtController(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await payDebt(req.params.id, req.body, req.ownerContext!, req.user!.sub));
  } catch (err) { next(err); }
}
