import { Request, Response, NextFunction } from 'express';
import { createCategory as svcCreate, listCategories as svcList } from './categories.service';
import { prisma } from '../../core/database/prisma';
import type { CreateCategoryInput } from './wallets.schema';

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await svcCreate(req.ownerContext!.ownerId, req.body as CreateCategoryInput));
  } catch (err) { next(err); }
}

export async function listCategories(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svcList(req.ownerContext!.ownerId));
  } catch (err) { next(err); }
}

export async function listWalletTypes(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await prisma.walletType.findMany());
  } catch (err) { next(err); }
}
