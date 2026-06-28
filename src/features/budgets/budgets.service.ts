import { prisma } from '../../core/database/prisma';
import { AppError } from '../../core/errors';
import { Prisma } from '@prisma/client';
import type { CreateBudgetInput, UpdateBudgetInput } from './budgets.schema';

export async function listBudgets(ownerId: string) {
  return prisma.budget.findMany({ where: { ownerId } });
}

export async function createBudget(ownerId: string, input: CreateBudgetInput) {
  // Verificar que categoryId pertenezca al owner
  const category = await prisma.category.findUnique({
    where: { id: input.categoryId },
  });

  if (!category || category.ownerId !== ownerId) {
    throw new AppError(404, 'Categoría no encontrada');
  }

  try {
    return await prisma.budget.create({
      data: {
        ownerId,
        categoryId: input.categoryId,
        month: input.month,
        limit: new Prisma.Decimal(input.limit),
      },
    });
  } catch (e: any) {
    if (e.code === 'P2002') {
      throw new AppError(409, 'Ya existe un presupuesto para esa categoría y mes');
    }
    throw e;
  }
}

export async function updateBudget(ownerId: string, budgetId: string, input: UpdateBudgetInput) {
  const existing = await prisma.budget.findUnique({ where: { id: budgetId } });

  if (!existing || existing.ownerId !== ownerId) {
    throw new AppError(404, 'Presupuesto no encontrado');
  }

  return prisma.budget.update({
    where: { id: budgetId },
    data: { limit: new Prisma.Decimal(input.limit) },
  });
}

export async function deleteBudget(ownerId: string, budgetId: string) {
  const existing = await prisma.budget.findUnique({ where: { id: budgetId } });

  if (!existing || existing.ownerId !== ownerId) {
    throw new AppError(404, 'Presupuesto no encontrado');
  }

  await prisma.budget.delete({ where: { id: budgetId } });
}
