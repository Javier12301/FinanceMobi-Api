import { z } from 'zod';

export const createRecurringRuleSchema = z.object({
  walletId: z.string().uuid(),
  destinationWalletId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid(),
  movementType: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  amount: z.number().positive(),
  description: z.string().nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31),
  autoPost: z.boolean().default(false),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable().optional(),
});

export const updateRecurringRuleSchema = z.object({
  amount: z.number().positive().optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  autoPost: z.boolean().optional(),
  active: z.boolean().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export type CreateRecurringRuleInput = z.infer<typeof createRecurringRuleSchema>;
export type UpdateRecurringRuleInput = z.infer<typeof updateRecurringRuleSchema>;
