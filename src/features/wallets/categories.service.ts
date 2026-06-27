import { prisma } from '../../core/database/prisma';
import type { CreateCategoryInput } from './wallets.schema';

export async function createCategory(ownerId: string, input: CreateCategoryInput) {
  return prisma.category.create({
    data: { ownerId, name: input.name, movementType: input.movementType },
  });
}

export async function listCategories(ownerId: string) {
  return prisma.category.findMany({ where: { ownerId } });
}
