import { Request, Response, NextFunction } from 'express';
import { adjustWalletBalance as svcAdjustBalance, createWallet as svcCreate, listWallets as svcList, updateWallet as svcUpdate, deleteWallet as svcDelete } from './wallets.service';
import type { AdjustWalletBalanceInput, CreateWalletInput, UpdateWalletInput } from './wallets.schema';

export async function createWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const wallet = await svcCreate(req.ownerContext!.ownerId, req.body as CreateWalletInput);
    res.status(201).json(wallet);
  } catch (err) { next(err); }
}

export async function listWallets(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svcList(req.ownerContext!.ownerId));
  } catch (err) { next(err); }
}

export async function updateWallet(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svcUpdate(req.params.walletId, req.body as UpdateWalletInput));
  } catch (err) { next(err); }
}

export async function deleteWallet(req: Request, res: Response, next: NextFunction) {
  try {
    await svcDelete(req.params.walletId);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function adjustWalletBalance(req: Request, res: Response, next: NextFunction) {
  try {
    const transaction = await svcAdjustBalance(req.params.walletId, req.ownerContext!.ownerId, req.user!.sub, req.body as AdjustWalletBalanceInput);
    res.status(201).json(transaction);
  } catch (err) { next(err); }
}
