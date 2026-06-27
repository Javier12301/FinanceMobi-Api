import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCategory, listCategories } from './categories.service';

// Mocks
vi.mock('../../core/database/prisma', () => ({
  prisma: {
    category: {
      create: vi.fn(),
      findMany: vi.fn(),
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

beforeEach(() => vi.clearAllMocks());

describe('Categories Service', () => {
  describe('createCategory', () => {
    it('crea categoría con nombre y movementType', async () => {
      const mockCategory = {
        id: 'cat-1',
        ownerId: 'owner-1',
        name: 'Groceries',
        movementType: 'EXPENSE',
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

  });

  describe('listCategories', () => {
    it('retorna solo categorías del owner activo', async () => {
      const mockCategories = [
        {
          id: 'cat-1',
          ownerId: 'owner-1',
          name: 'Groceries',
          movementType: 'EXPENSE',
          createdAt: new Date(),
        },
        {
          id: 'cat-2',
          ownerId: 'owner-1',
          name: 'Salary',
          movementType: 'INCOME',
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
});
