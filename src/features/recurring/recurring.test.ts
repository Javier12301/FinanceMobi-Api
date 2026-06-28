import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  getPendingRules,
  confirmRule,
} from './recurring.service';
import { AppError } from '../../core/errors';

vi.mock('../../core/database/prisma', () => ({
  prisma: {
    recurringRule: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    wallet: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    category: {
      findUnique: vi.fn(),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: 'new-tx-1' }),
    },
    transactionHistory: {
      create: vi.fn().mockResolvedValue({}),
    },
    // F2: $transaction ejecuta el callback con el prisma mock para tests unitarios
    $transaction: vi.fn().mockImplementation(async (cb: (tx: any) => any) => {
      const { prisma } = await import('../../core/database/prisma');
      return cb({ ...prisma, $queryRaw: vi.fn().mockResolvedValue([]) });
    }),
  },
}));

import { prisma } from '../../core/database/prisma';

const mockRecurringRuleFindMany = (prisma.recurringRule as any).findMany as ReturnType<typeof vi.fn>;
const mockRecurringRuleFindUnique = (prisma.recurringRule as any).findUnique as ReturnType<
  typeof vi.fn
>;
const mockRecurringRuleCreate = (prisma.recurringRule as any).create as ReturnType<typeof vi.fn>;
const mockRecurringRuleUpdate = (prisma.recurringRule as any).update as ReturnType<typeof vi.fn>;
const mockRecurringRuleDelete = (prisma.recurringRule as any).delete as ReturnType<typeof vi.fn>;
const mockWalletFindUnique = (prisma.wallet as any).findUnique as ReturnType<typeof vi.fn>;
const mockCategoryFindUnique = (prisma.category as any).findUnique as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('Recurring Rules Service', () => {
  describe('listRules', () => {
    it('retorna reglas del owner', async () => {
      const rules = [
        { id: 'rule-1', ownerId: 'owner-1' },
        { id: 'rule-2', ownerId: 'owner-1' },
      ];
      mockRecurringRuleFindMany.mockResolvedValue(rules);

      const result = await listRules('owner-1');

      expect(result).toEqual(rules);
      expect(mockRecurringRuleFindMany).toHaveBeenCalledWith({
        where: { ownerId: 'owner-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('createRule', () => {
    it('crea regla correctamente con walletId y categoryId del owner', async () => {
      mockWalletFindUnique.mockResolvedValue({
        id: 'wallet-1',
        ownerId: 'owner-1',
      });
      mockCategoryFindUnique.mockResolvedValue({
        id: 'cat-1',
        ownerId: 'owner-1',
        movementType: 'INCOME', // F7: debe coincidir con input.movementType
      });
      mockRecurringRuleCreate.mockResolvedValue({
        id: 'rule-1',
        ownerId: 'owner-1',
        walletId: 'wallet-1',
        categoryId: 'cat-1',
        movementType: 'INCOME',
        amount: '100',
        dayOfMonth: 15,
        nextRunDate: new Date('2024-02-15'),
      });

      const input = {
        walletId: 'wallet-1',
        categoryId: 'cat-1',
        movementType: 'INCOME' as const,
        amount: 100,
        dayOfMonth: 15,
        autoPost: false,
        startDate: '2024-01-15T00:00:00Z',
      };

      const result = await createRule('owner-1', input);

      expect(result.id).toBe('rule-1');
      expect(mockWalletFindUnique).toHaveBeenCalledWith({ where: { id: 'wallet-1' } });
      expect(mockCategoryFindUnique).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
      expect(mockRecurringRuleCreate).toHaveBeenCalled();
    });

    it('lanza 404 si walletId no pertenece al owner', async () => {
      mockWalletFindUnique.mockResolvedValue({
        id: 'wallet-1',
        ownerId: 'other-owner',
      });

      const input = {
        walletId: 'wallet-1',
        categoryId: 'cat-1',
        movementType: 'INCOME' as const,
        amount: 100,
        dayOfMonth: 15,
        autoPost: false,
        startDate: '2024-01-15T00:00:00Z',
      };

      await expect(createRule('owner-1', input)).rejects.toThrow(AppError);
    });

    it('lanza 404 si categoryId no pertenece al owner', async () => {
      mockWalletFindUnique.mockResolvedValue({
        id: 'wallet-1',
        ownerId: 'owner-1',
      });
      mockCategoryFindUnique.mockResolvedValue({
        id: 'cat-1',
        ownerId: 'other-owner',
      });

      const input = {
        walletId: 'wallet-1',
        categoryId: 'cat-1',
        movementType: 'INCOME' as const,
        amount: 100,
        dayOfMonth: 15,
        autoPost: false,
        startDate: '2024-01-15T00:00:00Z',
      };

      await expect(createRule('owner-1', input)).rejects.toThrow(AppError);
    });

    it('lanza 400 si walletId === destinationWalletId en TRANSFER', async () => {
      mockWalletFindUnique.mockResolvedValue({ id: 'wallet-1', ownerId: 'owner-1' });
      mockCategoryFindUnique.mockResolvedValue({ id: 'cat-1', ownerId: 'owner-1', movementType: 'TRANSFER' });

      const input = {
        walletId: 'wallet-1',
        destinationWalletId: 'wallet-1', // misma wallet
        categoryId: 'cat-1',
        movementType: 'TRANSFER' as const,
        amount: 100,
        dayOfMonth: 15,
        autoPost: false,
        startDate: '2024-01-15T00:00:00Z',
      };

      await expect(createRule('owner-1', input)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('lanza 404 si destinationWalletId no pertenece al owner en TRANSFER', async () => {
      mockWalletFindUnique.mockResolvedValueOnce({
        id: 'wallet-1',
        ownerId: 'owner-1',
      });
      mockCategoryFindUnique.mockResolvedValue({
        id: 'cat-1',
        ownerId: 'owner-1',
      });
      mockWalletFindUnique.mockResolvedValueOnce({
        id: 'wallet-2',
        ownerId: 'other-owner',
      });

      const input = {
        walletId: 'wallet-1',
        destinationWalletId: 'wallet-2',
        categoryId: 'cat-1',
        movementType: 'TRANSFER' as const,
        amount: 100,
        dayOfMonth: 15,
        autoPost: false,
        startDate: '2024-01-15T00:00:00Z',
      };

      await expect(createRule('owner-1', input)).rejects.toThrow(AppError);
    });
  });

  describe('updateRule', () => {
    it('actualiza campos correctamente', async () => {
      mockRecurringRuleFindUnique.mockResolvedValue({
        id: 'rule-1',
        ownerId: 'owner-1',
        endDate: null,
      });
      mockRecurringRuleUpdate.mockResolvedValue({
        id: 'rule-1',
        ownerId: 'owner-1',
        amount: '150',
      });

      const result = await updateRule('owner-1', 'rule-1', { amount: 150 });

      expect(result.id).toBe('rule-1');
      expect(mockRecurringRuleUpdate).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: expect.objectContaining({ amount: 150 }),
      });
    });

    it('lanza 404 si no existe o no es del owner', async () => {
      mockRecurringRuleFindUnique.mockResolvedValue(null);

      await expect(updateRule('owner-1', 'rule-1', { amount: 150 })).rejects.toThrow(AppError);
    });
  });

  describe('deleteRule', () => {
    it('elimina correctamente', async () => {
      mockRecurringRuleFindUnique.mockResolvedValue({
        id: 'rule-1',
        ownerId: 'owner-1',
      });
      mockRecurringRuleDelete.mockResolvedValue({
        id: 'rule-1',
      });

      await deleteRule('owner-1', 'rule-1');

      expect(mockRecurringRuleDelete).toHaveBeenCalledWith({ where: { id: 'rule-1' } });
    });

    it('lanza 404 si no existe o no es del owner', async () => {
      mockRecurringRuleFindUnique.mockResolvedValue(null);

      await expect(deleteRule('owner-1', 'rule-1')).rejects.toThrow(AppError);
    });
  });

  describe('getPendingRules', () => {
    it('retorna reglas con nextRunDate <= now y autoPost=false', async () => {
      const pending = [
        {
          id: 'rule-1',
          ownerId: 'owner-1',
          nextRunDate: new Date('2024-01-01'),
          active: true,
          autoPost: false,
        },
      ];
      // getPendingRules llama findMany dos veces: primero autoPost=true, luego autoPost=false
      mockRecurringRuleFindMany
        .mockResolvedValueOnce([]) // autoPost=true (ninguna)
        .mockResolvedValueOnce(pending); // autoPost=false pendientes

      const result = await getPendingRules('owner-1', 'user-1', { ownerId: 'owner-1', role: 'OWNER' });

      expect(result).toEqual(pending);
      expect(mockRecurringRuleFindMany).toHaveBeenCalledWith({
        where: {
          ownerId: 'owner-1',
          active: true,
          autoPost: false,
          nextRunDate: { lte: expect.any(Date) },
        },
        orderBy: { nextRunDate: 'asc' },
      });
    });
  });

  describe('confirmRule', () => {
    it('crea transacción y avanza nextRunDate', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 86400000); // 1 día atrás

      const fakeWallet = { id: 'wallet-1', ownerId: 'owner-1', currentBalance: 500 };
      mockRecurringRuleFindUnique.mockResolvedValue({
        id: 'rule-1',
        ownerId: 'owner-1',
        active: true,
        nextRunDate: pastDate,
        walletId: 'wallet-1',
        categoryId: 'cat-1',
        movementType: 'INCOME',
        amount: '100',
        description: 'Test',
        destinationWalletId: null,
        dayOfMonth: 5,
      });
      (prisma.wallet as any).findUnique = vi.fn().mockResolvedValue(fakeWallet);
      (prisma.wallet as any).update = vi.fn().mockResolvedValue({});
      (prisma.transaction as any).create = vi.fn().mockResolvedValue({ id: 'new-tx-1' });
      (prisma.transactionHistory as any).create = vi.fn().mockResolvedValue({});
      mockRecurringRuleUpdate.mockResolvedValue({ id: 'rule-1' });

      const result = await confirmRule('owner-1', 'rule-1', 'user-1', {
        ownerId: 'owner-1',
        role: 'OWNER',
      });

      expect(result.alreadyConfirmed).toBe(false);
      expect((prisma.transaction as any).create).toHaveBeenCalled();
      expect(mockRecurringRuleUpdate).toHaveBeenCalled();
    });

    it('es idempotente si nextRunDate es futuro', async () => {
      const futureDate = new Date(new Date().getTime() + 86400000); // 1 día futura

      mockRecurringRuleFindUnique.mockResolvedValue({
        id: 'rule-1',
        ownerId: 'owner-1',
        nextRunDate: futureDate,
      });

      const result = await confirmRule('owner-1', 'rule-1', 'user-1', {
        ownerId: 'owner-1',
        role: 'OWNER',
      });

      expect(result.alreadyConfirmed).toBe(true);
      // no crea transacción ni modifica balances
      expect((prisma.transaction as any).create).not.toHaveBeenCalled();
    });

    it('lanza 409 si regla está pausada', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 86400000);

      mockRecurringRuleFindUnique.mockResolvedValue({
        id: 'rule-1',
        ownerId: 'owner-1',
        active: false,
        nextRunDate: pastDate,
      });

      await expect(
        confirmRule('owner-1', 'rule-1', 'user-1', {
          ownerId: 'owner-1',
          role: 'OWNER',
        }),
      ).rejects.toThrow(AppError);
    });
  });
});
