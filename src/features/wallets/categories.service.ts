import { prisma } from '../../core/database/prisma';
import { AppError } from '../../core/errors';
import type { CreateCategoryInput, UpdateCategoryInput } from './wallets.schema';

export async function createCategory(ownerId: string, input: CreateCategoryInput) {
  return prisma.category.create({
    data: { ownerId, name: input.name, movementType: input.movementType, icon: input.icon, color: input.color } as any,
  });
}

export async function listCategories(ownerId: string) {
  return prisma.category.findMany({ where: { ownerId } });
}

export async function updateCategory(ownerId: string, categoryId: string, input: UpdateCategoryInput) {
  const existing = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!existing || existing.ownerId !== ownerId) {
    throw new AppError(404, 'Categoría no encontrada');
  }

  const data: Record<string, any> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.icon !== undefined) data.icon = input.icon;
  if (input.color !== undefined) data.color = input.color;

  return prisma.category.update({
    where: { id: categoryId },
    data,
  });
}

export async function deleteCategory(ownerId: string, categoryId: string) {
  const existing = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!existing || existing.ownerId !== ownerId) {
    throw new AppError(404, 'Categoría no encontrada');
  }

  const [transactionCount, budgetCount, ruleCount] = await Promise.all([
    prisma.transaction.count({ where: { categoryId } }),
    prisma.budget.count({ where: { categoryId } }),
    prisma.recurringRule.count({ where: { categoryId } }),
  ]);

  if (transactionCount > 0) throw new AppError(409, 'La categoría tiene transacciones asociadas');
  if (budgetCount > 0) throw new AppError(409, 'La categoría tiene presupuestos asociados');
  if (ruleCount > 0) throw new AppError(409, 'La categoría tiene reglas recurrentes asociadas');

  await prisma.category.delete({ where: { id: categoryId } });
}
