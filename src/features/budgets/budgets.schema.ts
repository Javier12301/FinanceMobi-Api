import { z } from 'zod';

export const createBudgetSchema = z.object({
  categoryId: z.string().uuid('categoryId debe ser un UUID válido'),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month debe estar en formato YYYY-MM'),
  limit: z.number().positive('limit debe ser mayor a 0'),
});

export const updateBudgetSchema = z.object({
  limit: z.number().positive('limit debe ser mayor a 0'),
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
