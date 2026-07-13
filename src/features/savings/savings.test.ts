import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  addContribution,
  deleteContribution,
} from './savings.service';

vi.mock('../../core/database/prisma', () => ({
  prisma: {
    savingsGoal: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    savingsContribution: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from '../../core/database/prisma';

const mockGoalFindMany = (prisma as any).savingsGoal.findMany as ReturnType<typeof vi.fn>;
const mockGoalFindUnique = (prisma as any).savingsGoal.findUnique as ReturnType<typeof vi.fn>;
const mockGoalCreate = (prisma as any).savingsGoal.create as ReturnType<typeof vi.fn>;
const mockGoalUpdate = (prisma as any).savingsGoal.update as ReturnType<typeof vi.fn>;
const mockGoalDelete = (prisma as any).savingsGoal.delete as ReturnType<typeof vi.fn>;
const mockContribFindUnique = (prisma as any).savingsContribution.findUnique as ReturnType<typeof vi.fn>;
const mockContribCreate = (prisma as any).savingsContribution.create as ReturnType<typeof vi.fn>;
const mockContribDelete = (prisma as any).savingsContribution.delete as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const OWNER = 'owner-1';

describe('Savings Goals Service', () => {
  describe('listGoals', () => {
    it('calcula el progreso como la suma de los aportes', async () => {
      mockGoalFindMany.mockResolvedValue([
        {
          id: 'goal-1',
          ownerId: OWNER,
          name: 'Vacaciones',
          targetAmount: '100000.00',
          targetDate: null,
          contributions: [
            { id: 'c1', goalId: 'goal-1', amount: '15000.00', date: new Date() },
            { id: 'c2', goalId: 'goal-1', amount: '5000.50', date: new Date() },
          ],
        },
      ]);

      const [goal] = await listGoals(OWNER);

      expect(goal.saved).toBe('20000.50');
    });

    it('una meta sin aportes arranca en 0', async () => {
      mockGoalFindMany.mockResolvedValue([
        { id: 'goal-1', ownerId: OWNER, name: 'Auto', targetAmount: '500.00', targetDate: null, contributions: [] },
      ]);

      const [goal] = await listGoals(OWNER);

      expect(goal.saved).toBe('0.00');
    });
  });

  describe('createGoal', () => {
    it('crea la meta del owner', async () => {
      mockGoalCreate.mockImplementation(async (args: any) => ({ id: 'goal-1', ...args.data }));

      const goal = await createGoal(OWNER, { name: 'Vacaciones', targetAmount: 100000 });

      expect(mockGoalCreate.mock.calls[0][0].data.ownerId).toBe(OWNER);
      expect(goal.name).toBe('Vacaciones');
    });

    // Replay del outbox offline: reenviar el mismo id no debe duplicar la meta.
    it('es idempotente: mismo id del cliente devuelve la meta existente', async () => {
      const existing = { id: 'goal-1', ownerId: OWNER, name: 'Vacaciones', targetAmount: '100000.00' };
      mockGoalFindUnique.mockResolvedValue(existing);

      const goal = await createGoal(OWNER, { id: 'goal-1', name: 'Vacaciones', targetAmount: 100000 });

      expect(goal).toBe(existing);
      expect(mockGoalCreate).not.toHaveBeenCalled();
    });
  });

  describe('ownership', () => {
    it('no deja tocar la meta de otro owner (404)', async () => {
      mockGoalFindUnique.mockResolvedValue({ id: 'goal-1', ownerId: 'otro-owner' });

      await expect(updateGoal(OWNER, 'goal-1', { name: 'x' })).rejects.toMatchObject({ statusCode: 404 });
      await expect(deleteGoal(OWNER, 'goal-1')).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        addContribution(OWNER, 'goal-1', { amount: 100, date: new Date().toISOString() }),
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(mockGoalUpdate).not.toHaveBeenCalled();
      expect(mockGoalDelete).not.toHaveBeenCalled();
      expect(mockContribCreate).not.toHaveBeenCalled();
    });
  });

  describe('addContribution', () => {
    it('anota el aporte contra la meta', async () => {
      mockGoalFindUnique.mockResolvedValue({ id: 'goal-1', ownerId: OWNER });
      mockContribCreate.mockImplementation(async (args: any) => ({ id: 'c1', ...args.data }));

      const c = await addContribution(OWNER, 'goal-1', { amount: 5000, date: '2026-07-12T00:00:00.000Z' });

      expect(mockContribCreate.mock.calls[0][0].data.goalId).toBe('goal-1');
      expect(Number(c.amount)).toBe(5000);
    });

    it('es idempotente: mismo id del cliente no duplica el aporte', async () => {
      const existing = { id: 'c1', goalId: 'goal-1', amount: '5000.00' };
      mockGoalFindUnique.mockResolvedValue({ id: 'goal-1', ownerId: OWNER });
      mockContribFindUnique.mockResolvedValue(existing);

      const c = await addContribution(OWNER, 'goal-1', {
        id: 'c1',
        amount: 5000,
        date: '2026-07-12T00:00:00.000Z',
      });

      expect(c).toBe(existing);
      expect(mockContribCreate).not.toHaveBeenCalled();
    });
  });

  describe('deleteContribution', () => {
    it('deshace un aporte de una meta propia', async () => {
      mockContribFindUnique.mockResolvedValue({
        id: 'c1',
        goalId: 'goal-1',
        goal: { id: 'goal-1', ownerId: OWNER },
      });

      await deleteContribution(OWNER, 'goal-1', 'c1');

      expect(mockContribDelete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('no deja borrar el aporte de otro owner (404)', async () => {
      mockContribFindUnique.mockResolvedValue({
        id: 'c1',
        goalId: 'goal-1',
        goal: { id: 'goal-1', ownerId: 'otro-owner' },
      });

      await expect(deleteContribution(OWNER, 'goal-1', 'c1')).rejects.toMatchObject({ statusCode: 404 });
      expect(mockContribDelete).not.toHaveBeenCalled();
    });
  });
});
