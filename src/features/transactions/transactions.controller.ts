import type { Request, Response, NextFunction } from 'express';
import { createTransaction, listTransactions, updateTransaction, deleteTransaction } from './transactions.service';
import type { CreateTransactionInput, UpdateTransactionInput, ListTransactionFiltersInput } from './transactions.schema';

export async function createTransactionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await createTransaction(req.body as CreateTransactionInput, req.ownerContext!, req.user!.sub);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listTransactionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = req.query as Partial<ListTransactionFiltersInput>;
    const result = await listTransactions(req.ownerContext!.ownerId, filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateTransactionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await updateTransaction(
      req.params.transactionId,
      req.body as UpdateTransactionInput,
      req.user!.sub,
      req.ownerContext!,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function deleteTransactionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteTransaction(req.params.transactionId, req.ownerContext!);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
