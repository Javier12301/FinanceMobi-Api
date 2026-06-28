import type { Request, Response, NextFunction } from 'express';
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  getPendingRules,
  confirmRule,
} from './recurring.service';
import type { CreateRecurringRuleInput, UpdateRecurringRuleInput } from './recurring.schema';

export async function listRulesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await listRules(req.ownerContext!.ownerId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function createRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await createRule(req.ownerContext!.ownerId, req.body as CreateRecurringRuleInput);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await updateRule(
      req.ownerContext!.ownerId,
      req.params.id,
      req.body as UpdateRecurringRuleInput,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function deleteRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteRule(req.ownerContext!.ownerId, req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getPendingRulesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getPendingRules(req.ownerContext!.ownerId, req.user!.sub, req.ownerContext!);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function confirmRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await confirmRule(req.ownerContext!.ownerId, req.params.id, req.user!.sub, req.ownerContext!);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
