import { z } from 'zod';

export const createGoalSchema = z.object({
  // ID del cliente para idempotencia del replay offline.
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'El nombre es requerido').max(80),
  targetAmount: z.number().positive('La meta debe ser mayor a 0'),
  targetDate: z.string().datetime().optional(),
});

export const updateGoalSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  targetAmount: z.number().positive().optional(),
  // null para sacarle la fecha objetivo a una meta que la tenía.
  targetDate: z.string().datetime().nullable().optional(),
});

export const createContributionSchema = z.object({
  id: z.string().uuid().optional(),
  amount: z.number().positive('El aporte debe ser mayor a 0'),
  date: z.string().datetime(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type CreateContributionInput = z.infer<typeof createContributionSchema>;
