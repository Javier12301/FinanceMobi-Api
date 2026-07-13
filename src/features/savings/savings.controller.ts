import { Request, Response, NextFunction } from 'express';
import {
  listGoals as svcList,
  createGoal as svcCreate,
  updateGoal as svcUpdate,
  deleteGoal as svcDelete,
  addContribution as svcAddContribution,
  deleteContribution as svcDeleteContribution,
} from './savings.service';
import type { CreateGoalInput, UpdateGoalInput, CreateContributionInput } from './savings.schema';

export async function listGoals(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svcList(req.ownerContext!.ownerId));
  } catch (err) { next(err); }
}

export async function createGoal(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await svcCreate(req.ownerContext!.ownerId, req.body as CreateGoalInput));
  } catch (err) { next(err); }
}

export async function updateGoal(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svcUpdate(req.ownerContext!.ownerId, req.params.goalId, req.body as UpdateGoalInput));
  } catch (err) { next(err); }
}

export async function deleteGoal(req: Request, res: Response, next: NextFunction) {
  try {
    await svcDelete(req.ownerContext!.ownerId, req.params.goalId);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function addContribution(req: Request, res: Response, next: NextFunction) {
  try {
    const contribution = await svcAddContribution(
      req.ownerContext!.ownerId,
      req.params.goalId,
      req.body as CreateContributionInput,
    );
    res.status(201).json(contribution);
  } catch (err) { next(err); }
}

export async function deleteContribution(req: Request, res: Response, next: NextFunction) {
  try {
    await svcDeleteContribution(req.ownerContext!.ownerId, req.params.goalId, req.params.contributionId);
    res.status(204).send();
  } catch (err) { next(err); }
}
