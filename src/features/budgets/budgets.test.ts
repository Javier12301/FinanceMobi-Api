import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listBudgets, createBudget, updateBudget, deleteBudget } from './budgets.service';
import { AppError } from '../../core/errors';
import { Prisma } from '@prisma/client';

// Mocks
vi.mock('../../core/database/prisma', () => ({
  prisma: {
    budget: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    category: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../core/database/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

import { prisma } from '../../core/database/prisma';

const mockFindMany = prisma.budget.findMany as ReturnType<typeof vi.fn>;
const mockCreate = prisma.budget.create as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.budget.findUnique as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.budget.update as ReturnType<typeof vi.fn>;
const mockDelete = prisma.budget.delete as ReturnType<typeof vi.fn>;
const mockCategoryFindUnique = prisma.category.findUnique as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('Budgets Service', () => {
  describe('listBudgets', () => {
    it('retorna solo presupuestos del owner', async () => {
      const mockBudgets = [
        {
          id: 'budget-1',
          ownerId: 'owner-1',
          categoryId: 'cat-1',
          month: '2024-01',
          limit: '1000.00',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'budget-2',
          ownerId: 'owner-1',
          categoryId: 'cat-2',
          month: '2024-01',
          limit: '500.00',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockFindMany.mockResolvedValue(mockBudgets);

      const result = await listBudgets('owner-1');

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { ownerId: 'owner-1' },
      });
      expect(result).toHaveLength(2);
      expect(result.every((b) => b.ownerId === 'owner-1')).toBe(true);
    });

    it('retorna lista vacía si owner no tiene presupuestos', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await listBudgets('owner-2');

      expect(result).toEqual([]);
    });
  });

  describe('createBudget', () => {
    it('crea presupuesto correctamente con categoryId del owner', async () => {
      const mockCategory = {
        id: 'cat-1',
        ownerId: 'owner-1',
        movementType: 'EXPENSE',
        name: 'Groceries',
        icon: null,
        color: null,
        createdAt: new Date(),
      };

      const mockBudget = {
        id: 'budget-1',
        ownerId: 'owner-1',
        categoryId: 'cat-1',
        month: '2024-01',
        limit: '1000.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCategoryFindUnique.mockResolvedValue(mockCategory);
      mockCreate.mockResolvedValue(mockBudget);

      const result = await createBudget('owner-1', {
        categoryId: 'cat-1',
        month: '2024-01',
        limit: 1000,
      });

      expect(result.id).toBe('budget-1');
      expect(result.ownerId).toBe('owner-1');
      expect(result.categoryId).toBe('cat-1');
    });

    it('lanza 404 si categoryId no pertenece al owner', async () => {
      mockCategoryFindUnique.mockResolvedValue(null);

      try {
        await createBudget('owner-1', {
          categoryId: 'cat-other',
          month: '2024-01',
          limit: 1000,
        });
        expect.fail('debería lanzar AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(404);
      }
    });

    it('lanza 409 si ya existe presupuesto para esa categoría y mes', async () => {
      const mockCategory = {
        id: 'cat-1',
        ownerId: 'owner-1',
        movementType: 'EXPENSE',
        name: 'Groceries',
        icon: null,
        color: null,
        createdAt: new Date(),
      };

      const error = new Error('Unique constraint failed');
      (error as any).code = 'P2002';

      mockCategoryFindUnique.mockResolvedValue(mockCategory);
      mockCreate.mockRejectedValue(
        Object.assign(error, { code: 'P2002' })
      );

      try {
        await createBudget('owner-1', {
          categoryId: 'cat-1',
          month: '2024-01',
          limit: 1000,
        });
        expect.fail('debería lanzar AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(409);
      }
    });
  });

  describe('updateBudget', () => {
    it('actualiza limit correctamente', async () => {
      const existingBudget = {
        id: 'budget-1',
        ownerId: 'owner-1',
        categoryId: 'cat-1',
        month: '2024-01',
        limit: '1000.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedBudget = {
        ...existingBudget,
        limit: '1500.00',
      };

      mockFindUnique.mockResolvedValue(existingBudget);
      mockUpdate.mockResolvedValue(updatedBudget);

      const result = await updateBudget('owner-1', 'budget-1', {
        limit: 1500,
      });

      expect(result.limit).toBe('1500.00');
    });

    it('lanza 404 si presupuesto no existe', async () => {
      mockFindUnique.mockResolvedValue(null);

      try {
        await updateBudget('owner-1', 'non-existent', { limit: 1500 });
        expect.fail('debería lanzar AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(404);
      }
    });

    it('lanza 404 si presupuesto no pertenece al owner', async () => {
      const otherOwnerBudget = {
        id: 'budget-other',
        ownerId: 'owner-other',
        categoryId: 'cat-1',
        month: '2024-01',
        limit: '1000.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindUnique.mockResolvedValue(otherOwnerBudget);

      try {
        await updateBudget('owner-1', 'budget-other', { limit: 1500 });
        expect.fail('debería lanzar AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(404);
      }
    });
  });

  describe('deleteBudget', () => {
    it('elimina presupuesto correctamente', async () => {
      const existingBudget = {
        id: 'budget-1',
        ownerId: 'owner-1',
        categoryId: 'cat-1',
        month: '2024-01',
        limit: '1000.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindUnique.mockResolvedValue(existingBudget);
      mockDelete.mockResolvedValue(existingBudget);

      const result = await deleteBudget('owner-1', 'budget-1');

      expect(result).toBeUndefined();
      expect(mockDelete).toHaveBeenCalledWith({
        where: { id: 'budget-1' },
      });
    });

    it('lanza 404 si presupuesto no existe', async () => {
      mockFindUnique.mockResolvedValue(null);

      try {
        await deleteBudget('owner-1', 'non-existent');
        expect.fail('debería lanzar AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(404);
      }
    });

    it('lanza 404 si presupuesto no pertenece al owner', async () => {
      const otherOwnerBudget = {
        id: 'budget-other',
        ownerId: 'owner-other',
        categoryId: 'cat-1',
        month: '2024-01',
        limit: '1000.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindUnique.mockResolvedValue(otherOwnerBudget);

      try {
        await deleteBudget('owner-1', 'budget-other');
        expect.fail('debería lanzar AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(404);
      }
    });
  });
});
