import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCategory, listCategories, updateCategory, deleteCategory } from './categories.service';
import { AppError } from '../../core/errors';

// Mocks
vi.mock('../../core/database/prisma', () => ({
  prisma: {
    category: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    transaction: {
      count: vi.fn(),
    },
    budget: {
      count: vi.fn().mockResolvedValue(0),
    },
    recurringRule: {
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock('../../core/database/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

import { prisma } from '../../core/database/prisma';

const mockCreate = prisma.category.create as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.category.findMany as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.category.findUnique as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.category.update as ReturnType<typeof vi.fn>;
const mockDelete = prisma.category.delete as ReturnType<typeof vi.fn>;
const mockTransactionCount = prisma.transaction.count as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('Categories Service', () => {
  describe('createCategory', () => {
    it('crea categoría con nombre y movementType', async () => {
      const mockCategory = {
        id: 'cat-1',
        ownerId: 'owner-1',
        name: 'Groceries',
        movementType: 'EXPENSE',
        icon: null,
        color: null,
        createdAt: new Date(),
      };

      mockCreate.mockResolvedValue(mockCategory);

      const result = await createCategory('owner-1', {
        name: 'Groceries',
        movementType: 'EXPENSE',
      });

      expect(result.id).toBe('cat-1');
      expect(result.name).toBe('Groceries');
      expect(result.movementType).toBe('EXPENSE');
    });

    it('crea categoría con icon y color opcionales', async () => {
      const mockCategory = {
        id: 'cat-2',
        ownerId: 'owner-1',
        name: 'Restaurants',
        movementType: 'EXPENSE',
        icon: 'utensils',
        color: '#FF6B6B',
        createdAt: new Date(),
      };

      mockCreate.mockResolvedValue(mockCategory);

      const result = await createCategory('owner-1', {
        name: 'Restaurants',
        movementType: 'EXPENSE',
        icon: 'utensils',
        color: '#FF6B6B',
      });

      expect((result as any).icon).toBe('utensils');
      expect((result as any).color).toBe('#FF6B6B');
    });

  });

  describe('listCategories', () => {
    it('retorna solo categorías del owner activo', async () => {
      const mockCategories = [
        {
          id: 'cat-1',
          ownerId: 'owner-1',
          name: 'Groceries',
          movementType: 'EXPENSE',
          icon: null,
          color: null,
          createdAt: new Date(),
        },
        {
          id: 'cat-2',
          ownerId: 'owner-1',
          name: 'Salary',
          movementType: 'INCOME',
          icon: null,
          color: null,
          createdAt: new Date(),
        },
      ];

      mockFindMany.mockResolvedValue(mockCategories);

      const result = await listCategories('owner-1');

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { ownerId: 'owner-1' },
      });
      expect(result).toHaveLength(2);
      expect(result.every((cat) => cat.ownerId === 'owner-1')).toBe(true);
    });

    it('retorna lista vacía si owner no tiene categorías', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await listCategories('owner-2');

      expect(result).toEqual([]);
    });
  });

  describe('updateCategory', () => {
    it('actualiza nombre, icon y color', async () => {
      const existingCategory = {
        id: 'cat-1',
        ownerId: 'owner-1',
        name: 'Groceries',
        movementType: 'EXPENSE',
        icon: null,
        color: null,
        createdAt: new Date(),
      };

      const updatedCategory = {
        ...existingCategory,
        name: 'Updated Groceries',
        icon: 'cart',
        color: '#FF0000',
      };

      mockFindUnique.mockResolvedValue(existingCategory);
      mockUpdate.mockResolvedValue(updatedCategory);

      const result = await updateCategory('owner-1', 'cat-1', {
        name: 'Updated Groceries',
        icon: 'cart',
        color: '#FF0000',
      });

      expect(result.name).toBe('Updated Groceries');
      expect((result as any).icon).toBe('cart');
      expect((result as any).color).toBe('#FF0000');
      expect(result.movementType).toBe('EXPENSE');
    });

    it('lanza 404 si categoría no existe', async () => {
      mockFindUnique.mockResolvedValue(null);

      try {
        await updateCategory('owner-1', 'non-existent', { name: 'Test' });
        expect.fail('debería lanzar AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(404);
      }
    });

    it('lanza 404 si categoría no pertenece al owner', async () => {
      const otherOwnerCategory = {
        id: 'cat-other',
        ownerId: 'owner-other',
        name: 'Other',
        movementType: 'EXPENSE',
        icon: null,
        color: null,
        createdAt: new Date(),
      };

      mockFindUnique.mockResolvedValue(otherOwnerCategory);

      try {
        await updateCategory('owner-1', 'cat-other-owner', { name: 'Test' });
        expect.fail('debería lanzar AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(404);
      }
    });
  });

  describe('deleteCategory', () => {
    it('elimina categoría sin transacciones', async () => {
      const existingCategory = {
        id: 'cat-1',
        ownerId: 'owner-1',
        name: 'Groceries',
        movementType: 'EXPENSE',
        icon: null,
        color: null,
        createdAt: new Date(),
      };

      mockFindUnique.mockResolvedValue(existingCategory);
      mockTransactionCount.mockResolvedValue(0);
      mockDelete.mockResolvedValue(existingCategory);

      const result = await deleteCategory('owner-1', 'cat-1');

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
      });
      expect(mockTransactionCount).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1' },
      });
      expect(mockDelete).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
      });
      expect(result).toBeUndefined();
    });

    it('lanza 409 si categoría tiene transacciones', async () => {
      const existingCategory = {
        id: 'cat-1',
        ownerId: 'owner-1',
        name: 'Groceries',
        movementType: 'EXPENSE',
        icon: null,
        color: null,
        createdAt: new Date(),
      };

      mockFindUnique.mockResolvedValue(existingCategory);
      mockTransactionCount.mockResolvedValue(5);

      try {
        await deleteCategory('owner-1', 'cat-1');
        expect.fail('debería lanzar AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(409);
      }
    });

    it('lanza 404 si categoría no existe', async () => {
      mockFindUnique.mockResolvedValue(null);

      try {
        await deleteCategory('owner-1', 'non-existent');
        expect.fail('debería lanzar AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(404);
      }
    });
  });
});
