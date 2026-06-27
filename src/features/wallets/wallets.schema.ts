import { z } from 'zod';

export const createWalletSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  typeId: z.number().int().positive('typeId debe ser un número positivo'),
  description: z.string().optional(),
  initialBalance: z.number().min(0, 'El balance inicial debe ser >= 0'),
});

export const updateWalletSchema = z.object({
  name: z.string().min(1).optional(),
  typeId: z.number().int().positive().optional(),
  description: z.string().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  movementType: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type UpdateWalletInput = z.infer<typeof updateWalletSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
