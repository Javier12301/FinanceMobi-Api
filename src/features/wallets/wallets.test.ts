import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createWallet,
  listWallets,
  updateWallet,
  deleteWallet,
} from './wallets.service';
import { AppError } from '../../core/errors';

// Mocks
vi.mock('../../core/database/prisma', () => ({
  prisma: {
    wallet: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    transaction: {
      count: vi.fn(),
    },
  },
}));

vi.mock('../../core/database/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  },
}));

import { prisma } from '../../core/database/prisma';

const mockCreate = prisma.wallet.create as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.wallet.findMany as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.wallet.update as ReturnType<typeof vi.fn>;
const mockDelete = prisma.wallet.delete as ReturnType<typeof vi.fn>;
const mockTransactionCount = (prisma.transaction as any).count as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('Wallets Service', () => {
  describe('createWallet', () => {
    it('crea wallet con balance correcto', async () => {
      const mockWallet = {
        id: 'wallet-1',
        ownerId: 'owner-1',
        typeId: 1,
        name: 'Mi Billetera',
        description: 'Test',
        initialBalance: '500.00',
        currentBalance: '500.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCreate.mockResolvedValue(mockWallet);

      const result = await createWallet('owner-1', {
        name: 'Mi Billetera',
        typeId: 1,
        description: 'Test',
        initialBalance: 500.00,
      });

      expect(result.currentBalance).toBe('500.00');
      expect(result.initialBalance).toBe('500.00');
    });

  });

  describe('listWallets', () => {
    it('retorna solo wallets del owner activo', async () => {
      const mockWallets = [
        {
          id: 'wallet-1',
          ownerId: 'owner-1',
          typeId: 1,
          name: 'Billetera 1',
          description: null,
          initialBalance: '1000.00',
          currentBalance: '1000.00',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockFindMany.mockResolvedValue(mockWallets);

      const result = await listWallets('owner-1');

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { ownerId: 'owner-1' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].ownerId).toBe('owner-1');
    });
  });

  describe('updateWallet', () => {
    it('actualiza solo metadata (nombre y descripción)', async () => {
      const mockWallet = {
        id: 'wallet-1',
        ownerId: 'owner-1',
        typeId: 1,
        name: 'Nombre Nuevo',
        description: 'Desc Nueva',
        initialBalance: '500.00',
        currentBalance: '500.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUpdate.mockResolvedValue(mockWallet);

      const result = await updateWallet('wallet-1', {
        name: 'Nombre Nuevo',
        description: 'Desc Nueva',
      });

      // Verificar que no intenta actualizar balances
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: expect.objectContaining({
          name: 'Nombre Nuevo',
          description: 'Desc Nueva',
        }),
      });

      // Asegurar que balances no están en data
      const callData = mockUpdate.mock.calls[0][0].data;
      expect(callData).not.toHaveProperty('initialBalance');
      expect(callData).not.toHaveProperty('currentBalance');
    });
  });

  describe('deleteWallet', () => {
    it('elimina wallet sin transacciones', async () => {
      mockTransactionCount.mockResolvedValue(0);
      mockDelete.mockResolvedValue({ id: 'wallet-1' });

      const result = await deleteWallet('wallet-1');

      expect(result).toBeDefined();
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'wallet-1' } });
    });

    it('lanza 409 si wallet tiene transacciones', async () => {
      mockTransactionCount.mockResolvedValue(1);

      await expect(deleteWallet('wallet-1')).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('transacciones'),
      });
    });
  });

});
