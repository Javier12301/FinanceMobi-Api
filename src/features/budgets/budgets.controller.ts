import { Request, Response, NextFunction } from 'express';
import { listBudgets as svcList, createBudget as svcCreate, updateBudget as svcUpdate, deleteBudget as svcDelete } from './budgets.service';
import type { CreateBudgetInput, UpdateBudgetInput } from './budgets.schema';

export async function listBudgets(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svcList(req.ownerContext!.ownerId));
  } catch (err) { next(err); }
}

export async function createBudget(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await svcCreate(req.ownerContext!.ownerId, req.body as CreateBudgetInput));
  } catch (err) { next(err); }
}

export async function updateBudget(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svcUpdate(req.ownerContext!.ownerId, req.params.id, req.body as UpdateBudgetInput));
  } catch (err) { next(err); }
}

export async function deleteBudget(req: Request, res: Response, next: NextFunction) {
  try {
    await svcDelete(req.ownerContext!.ownerId, req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}
