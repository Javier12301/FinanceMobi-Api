import { z } from 'zod';

export const createTransactionSchema = z.object({
  walletId: z.string().uuid(),
  destinationWalletId: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  amount: z.number().positive('El monto debe ser positivo'),
  description: z.string().optional(),
  date: z.string().datetime(),
  movementType: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
});

export const updateTransactionSchema = z.object({
  categoryId: z.string().uuid().optional(),
  amount: z.number().positive().optional(),
  description: z.string().optional(),
  date: z.string().datetime().optional(),
});

export const listTransactionFiltersSchema = z.object({
  walletId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  // V4: filtros adicionales
  q: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListTransactionFiltersInput = z.infer<typeof listTransactionFiltersSchema>;
