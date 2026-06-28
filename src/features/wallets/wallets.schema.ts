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

const iconEnum = z.enum(['utensils', 'cart', 'bus', 'car', 'home', 'lightbulb', 'wifi', 'phone', 'drama', 'dumbbell', 'health', 'education', 'shirt', 'gift', 'plane', 'receipt', 'card', 'wallet', 'piggy', 'tag']);
const colorRegex = /^#[0-9a-fA-F]{6}$/;

export const createCategorySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  movementType: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  icon: iconEnum.nullable().optional(),
  color: z.string().regex(colorRegex, 'El color debe ser un hex válido (#RRGGBB)').nullable().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  icon: iconEnum.optional().nullable(),
  color: z.string().regex(colorRegex, 'El color debe ser un hex válido (#RRGGBB)').optional().nullable(),
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type UpdateWalletInput = z.infer<typeof updateWalletSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
