import type { Request, Response, NextFunction } from 'express';
import {
  createTransaction,
  listTransactions,
  updateTransaction,
  deleteTransaction,
  postDuePendingTransactions,
  postTransactionNow,
} from './transactions.service';
import { listTransactionFiltersSchema } from './transactions.schema';
import type { CreateTransactionInput, UpdateTransactionInput } from './transactions.schema';
import { AppError } from '../../core/errors';

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
    const hasQueryParams = Object.keys(req.query).length > 0;
    const parsed = listTransactionFiltersSchema.safeParse(req.query);
    if (!parsed.success) throw new AppError(400, 'Parámetros de filtro inválidos');
    // Materializa los gastos futuros vencidos antes de listar (sin cron; ver postDuePendingTransactions).
    await postDuePendingTransactions(req.ownerContext!.ownerId, req.user!.sub, req.ownerContext!);
    const result = await listTransactions(req.ownerContext!.ownerId, parsed.data, hasQueryParams);
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

// "Ya se me descontó": postea un movimiento futuro sin esperar a su fecha.
export async function postTransactionNowHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await postTransactionNow(req.params.transactionId, req.ownerContext!, req.user!.sub);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function deleteTransactionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteTransaction(req.params.transactionId, req.ownerContext!, req.user!.sub);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
