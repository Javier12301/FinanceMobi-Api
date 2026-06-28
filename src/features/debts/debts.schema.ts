import { z } from 'zod';

export const createDebtSchema = z.object({
  direction: z.enum(['I_OWE', 'OWED_TO_ME']),
  counterparty: z.string().min(1),
  principal: z.number().positive(),
  categoryId: z.string().uuid().optional(),
  installmentsTotal: z.number().int().positive().optional(),
  dueDate: z.string().datetime().optional(),
  walletId: z.string().uuid().optional(), // requerido para crear RecurringRule automática con cuotas
  notes: z.string().optional(),
});

export const updateDebtSchema = z.object({
  counterparty: z.string().min(1).optional(),
  remaining: z.number().nonnegative().optional(),
  status: z.enum(['ACTIVE', 'PAID']).optional(),
  notes: z.string().optional(),
});

export const payDebtSchema = z.object({
  walletId: z.string().uuid(),
  amount: z.number().positive(),
});

export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;
export type PayDebtInput = z.infer<typeof payDebtSchema>;
