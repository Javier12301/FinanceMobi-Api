import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { AppError } from '../../core/errors';
import type { CreateGoalInput, UpdateGoalInput, CreateContributionInput } from './savings.schema';

/**
 * Objetivos de ahorro tipo "sobre": NO mueven plata real. No tocan billeteras ni el ledger; el
 * progreso es simplemente la suma de los aportes que el usuario va anotando.
 */

/** Valida que la meta exista y sea del owner. Devuelve la meta. */
async function requireOwnGoal(ownerId: string, goalId: string) {
  const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
  if (!goal || goal.ownerId !== ownerId) throw new AppError(404, 'Objetivo de ahorro no encontrado');
  return goal;
}

export async function listGoals(ownerId: string) {
  const goals = await prisma.savingsGoal.findMany({
    where: { ownerId },
    include: { contributions: { orderBy: { date: 'desc' } } },
    orderBy: { createdAt: 'desc' },
  });

  // `saved` va como string, igual que el resto de los decimales del contrato.
  return goals.map((goal) => ({
    ...goal,
    saved: goal.contributions.reduce((sum, c) => sum + Number(c.amount), 0).toFixed(2),
  }));
}

export async function createGoal(ownerId: string, input: CreateGoalInput) {
  // Idempotencia: replay del outbox offline.
  if (input.id) {
    const existing = await prisma.savingsGoal.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.ownerId !== ownerId) throw new AppError(409, 'El identificador ya pertenece a otro objetivo');
      return existing;
    }
  }

  return prisma.savingsGoal.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      ownerId,
      name: input.name,
      targetAmount: new Prisma.Decimal(input.targetAmount),
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
    },
  });
}

export async function updateGoal(ownerId: string, goalId: string, input: UpdateGoalInput) {
  const goal = await requireOwnGoal(ownerId, goalId);

  return prisma.savingsGoal.update({
    where: { id: goal.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.targetAmount !== undefined ? { targetAmount: new Prisma.Decimal(input.targetAmount) } : {}),
      // `null` explícito saca la fecha objetivo; `undefined` la deja como está.
      ...(input.targetDate !== undefined
        ? { targetDate: input.targetDate ? new Date(input.targetDate) : null }
        : {}),
    },
  });
}

export async function deleteGoal(ownerId: string, goalId: string) {
  const goal = await requireOwnGoal(ownerId, goalId);
  // Los aportes se van con la meta (onDelete: Cascade).
  await prisma.savingsGoal.delete({ where: { id: goal.id } });
}

export async function addContribution(ownerId: string, goalId: string, input: CreateContributionInput) {
  await requireOwnGoal(ownerId, goalId);

  // Idempotencia: replay del outbox offline.
  if (input.id) {
    const existing = await prisma.savingsContribution.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.goalId !== goalId) throw new AppError(409, 'El identificador ya pertenece a otro aporte');
      return existing;
    }
  }

  return prisma.savingsContribution.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      goalId,
      amount: new Prisma.Decimal(input.amount),
      date: new Date(input.date),
    },
  });
}

export async function deleteContribution(ownerId: string, goalId: string, contributionId: string) {
  const contribution = await prisma.savingsContribution.findUnique({
    where: { id: contributionId },
    include: { goal: true },
  });

  if (!contribution || contribution.goalId !== goalId || contribution.goal.ownerId !== ownerId) {
    throw new AppError(404, 'Aporte no encontrado');
  }

  await prisma.savingsContribution.delete({ where: { id: contributionId } });
}
