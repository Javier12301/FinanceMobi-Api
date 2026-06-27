import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTransaction,
  listTransactions,
  updateTransaction,
  deleteTransaction,
} from './transactions.service';
import { AppError } from '../../core/errors';

vi.mock('../../core/database/prisma', () => ({
  prisma: {
    wallet: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    category: {
      findUnique: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    transactionHistory: {
      create: vi.fn(),
    },
    transactionAttachment: {
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock('../../core/security/driveClient', () => ({
  getDriveClient: vi.fn(() => ({
    files: {
      delete: vi.fn().mockResolvedValue({}),
    },
  })),
}));

import { prisma } from '../../core/database/prisma';

const mockWalletFindUnique = prisma.wallet.findUnique as ReturnType<typeof vi.fn>;
const mockWalletFindMany = prisma.wallet.findMany as ReturnType<typeof vi.fn>;
const mockWalletUpdate = prisma.wallet.update as ReturnType<typeof vi.fn>;
const mockCategoryFindUnique = (prisma.category as any).findUnique as ReturnType<typeof vi.fn>;
const mockTransactionCreate = prisma.transaction.create as ReturnType<typeof vi.fn>;
const mockTransactionFindUnique = prisma.transaction.findUnique as ReturnType<typeof vi.fn>;
const mockTransactionFindFirst = prisma.transaction.findFirst as ReturnType<typeof vi.fn>;
const mockTransactionFindMany = prisma.transaction.findMany as ReturnType<typeof vi.fn>;
const mockTransactionUpdate = prisma.transaction.update as ReturnType<typeof vi.fn>;
const mockTransactionDelete = prisma.transaction.delete as ReturnType<typeof vi.fn>;
const mockTransactionHistoryCreate = (prisma.transactionHistory as any).create as ReturnType<typeof vi.fn>;
const mockTransactionAttachmentDeleteMany = (prisma.transactionAttachment as any).deleteMany as ReturnType<typeof vi.fn>;
const mockUserFindUnique = (prisma.user as any).findUnique as ReturnType<typeof vi.fn>;
const mockPrismaTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('Transactions Service', () => {
  describe('createTransaction', () => {
    it('rechaza monto <= 0', async () => {
      await expect(
        createTransaction(
          {
            walletId: 'wallet-1',
            categoryId: 'cat-1',
            amount: 0,
            date: new Date().toISOString(),
            movementType: 'INCOME',
          },
          { ownerId: 'owner-1', role: 'OWNER' },
          'user-1',
        ),
      ).rejects.toThrow();
    });

    it('aumenta balance en INCOME', async () => {
      const walletBefore = {
        id: 'wallet-1',
        ownerId: 'owner-1',
        currentBalance: { toNumber: () => 100.0 },
      };
      const mockCategory = {
        id: 'cat-1',
        ownerId: 'owner-1',
      };
      const txMock = async (fn: Function) => fn(prisma);

      mockPrismaTransaction.mockImplementation(txMock);
      mockQueryRaw.mockResolvedValue(undefined);
      mockWalletFindUnique.mockResolvedValue(walletBefore);
      mockCategoryFindUnique.mockResolvedValue(mockCategory);
      mockWalletUpdate.mockResolvedValue({
        id: 'wallet-1',
        currentBalance: { toNumber: () => 125.0 },
      });
      mockTransactionCreate.mockResolvedValue({
        id: 'tx-1',
        amount: { toNumber: () => 25.0 },
      });
      mockTransactionHistoryCreate.mockResolvedValue({});

      await createTransaction(
        {
          walletId: 'wallet-1',
          categoryId: 'cat-1',
          amount: 25.0,
          date: new Date().toISOString(),
          movementType: 'INCOME',
        },
        { ownerId: 'owner-1', role: 'OWNER' },
        'user-1',
      );

      expect(mockWalletUpdate).toHaveBeenCalled();
    });

    it('disminuye balance en EXPENSE', async () => {
      const walletBefore = {
        id: 'wallet-1',
        ownerId: 'owner-1',
        currentBalance: { toNumber: () => 100.0 },
      };
      const mockCategory = {
        id: 'cat-1',
        ownerId: 'owner-1',
      };
      const txMock = async (fn: Function) => fn(prisma);

      mockPrismaTransaction.mockImplementation(txMock);
      mockQueryRaw.mockResolvedValue(undefined);
      mockWalletFindUnique.mockResolvedValue(walletBefore);
      mockCategoryFindUnique.mockResolvedValue(mockCategory);
      mockWalletUpdate.mockResolvedValue({
        id: 'wallet-1',
        currentBalance: { toNumber: () => 75.0 },
      });
      mockTransactionCreate.mockResolvedValue({
        id: 'tx-1',
        amount: { toNumber: () => 25.0 },
      });
      mockTransactionHistoryCreate.mockResolvedValue({});

      await createTransaction(
        {
          walletId: 'wallet-1',
          categoryId: 'cat-1',
          amount: 25.0,
          date: new Date().toISOString(),
          movementType: 'EXPENSE',
        },
        { ownerId: 'owner-1', role: 'OWNER' },
        'user-1',
      );

      expect(mockWalletUpdate).toHaveBeenCalled();
    });

    it('actualiza source y destination en TRANSFER', async () => {
      const sourceBefore = {
        id: 'wallet-1',
        ownerId: 'owner-1',
        currentBalance: { toNumber: () => 100.0 },
      };
      const destBefore = {
        id: 'wallet-2',
        ownerId: 'owner-1',
        currentBalance: { toNumber: () => 10.0 },
      };
      const mockCategory = {
        id: 'cat-1',
        ownerId: 'owner-1',
      };
      const txMock = async (fn: Function) => fn(prisma);

      mockPrismaTransaction.mockImplementation(txMock);
      mockQueryRaw.mockResolvedValue(undefined);
      mockWalletFindUnique.mockImplementation((opts) => {
        if (opts.where.id === 'wallet-1') return Promise.resolve(sourceBefore);
        if (opts.where.id === 'wallet-2') return Promise.resolve(destBefore);
        return Promise.resolve(undefined);
      });
      mockCategoryFindUnique.mockResolvedValue(mockCategory);
      mockWalletUpdate.mockResolvedValue({ id: 'wallet-1', currentBalance: { toNumber: () => 0 } });
      mockTransactionCreate.mockResolvedValue({
        id: 'tx-1',
        amount: { toNumber: () => 25.0 },
      });
      mockTransactionHistoryCreate.mockResolvedValue({});

      await createTransaction(
        {
          walletId: 'wallet-1',
          destinationWalletId: 'wallet-2',
          categoryId: 'cat-1',
          amount: 25.0,
          date: new Date().toISOString(),
          movementType: 'TRANSFER',
        },
        { ownerId: 'owner-1', role: 'OWNER' },
        'user-1',
      );

      expect(mockWalletUpdate).toHaveBeenCalled();
      expect(mockTransactionCreate).toHaveBeenCalled();
    });

    it('revierte cambios en rollback de transacción', async () => {
      const txMock = async (fn: Function) => {
        throw new Error('Transaction failed');
      };

      mockPrismaTransaction.mockImplementation(txMock);

      await expect(
        createTransaction(
          {
            walletId: 'wallet-1',
            categoryId: 'cat-1',
            amount: 25.0,
            date: new Date().toISOString(),
            movementType: 'INCOME',
          },
          { ownerId: 'owner-1', role: 'OWNER' },
          'user-1',
        ),
      ).rejects.toThrow();
    });
  });

  describe('listTransactions', () => {
    it('filtra por walletId', async () => {
      const mockTxs: any[] = [
        {
          id: 'tx-1',
          walletId: 'wallet-1',
          amount: '25.00',
        },
      ];

      mockWalletFindMany.mockResolvedValue([{ id: 'wallet-1' }]);
      mockTransactionFindMany.mockResolvedValue(mockTxs);

      const result = await listTransactions('owner-1', { walletId: 'wallet-1' });

      expect(mockTransactionFindMany).toHaveBeenCalled();
      const call = mockTransactionFindMany.mock.calls[0][0];
      expect(call.where).toMatchObject({ walletId: { in: ['wallet-1'] } });
    });

    it('filtra por categoryId', async () => {
      const mockTxs: any[] = [];

      mockWalletFindMany.mockResolvedValue([{ id: 'wallet-1' }]);
      mockTransactionFindMany.mockResolvedValue(mockTxs);

      await listTransactions('owner-1', { categoryId: 'cat-1' });

      const call = mockTransactionFindMany.mock.calls[0][0];
      expect(call.where).toMatchObject({ categoryId: 'cat-1' });
    });

    it('filtra por date range', async () => {
      const mockTxs: any[] = [];
      const from = new Date('2026-01-01').toISOString();
      const to = new Date('2026-12-31').toISOString();

      mockWalletFindMany.mockResolvedValue([{ id: 'wallet-1' }]);
      mockTransactionFindMany.mockResolvedValue(mockTxs);

      await listTransactions('owner-1', { dateFrom: from, dateTo: to });

      const call = mockTransactionFindMany.mock.calls[0][0];
      expect(call.where.date).toBeDefined();
    });
  });

  describe('updateTransaction', () => {
    it('crea TransactionHistory con oldSnapshot y newSnapshot', async () => {
      const oldTx = {
        id: 'tx-1',
        walletId: 'wallet-1',
        categoryId: 'cat-1',
        amount: '25.00',
        description: 'Old',
        date: new Date(),
        movementType: 'INCOME',
      };
      const newTx = {
        id: 'tx-1',
        walletId: 'wallet-1',
        categoryId: 'cat-2',
        amount: '25.00',
        description: 'New',
        date: new Date(),
        movementType: 'INCOME',
      };
      const wallet = {
        id: 'wallet-1',
        ownerId: 'owner-1',
        currentBalance: { toNumber: () => 100.0 },
      };
      const txMock = async (fn: Function) => {
        return fn(prisma);
      };

      mockPrismaTransaction.mockImplementation(txMock);
      mockTransactionFindFirst.mockResolvedValue(oldTx);
      mockQueryRaw.mockResolvedValue(undefined);
      mockWalletFindUnique.mockResolvedValue(wallet);
      mockWalletUpdate.mockResolvedValue(wallet);
      mockTransactionUpdate.mockResolvedValue(newTx);
      mockTransactionHistoryCreate.mockResolvedValue({});

      await updateTransaction(
        'tx-1',
        {
          categoryId: 'cat-2',
          description: 'New',
        },
        'user-1',
        { ownerId: 'owner-1', role: 'OWNER' },
      );

      expect(mockTransactionHistoryCreate).toHaveBeenCalled();
      const histCall = mockTransactionHistoryCreate.mock.calls[0][0];
      expect(histCall.data.action).toBe('UPDATE');
      expect(histCall.data.oldSnapshot).toBeDefined();
      expect(histCall.data.newSnapshot).toBeDefined();
    });
  });

  describe('deleteTransaction', () => {
    it('revertir saldo INCOME: currentBalance - amount', async () => {
      const transaction = {
        id: 'tx-1',
        walletId: 'wallet-1',
        destinationWalletId: null,
        amount: '25.00',
        movementType: 'INCOME',
      };
      const wallet = {
        id: 'wallet-1',
        ownerId: 'owner-1',
        currentBalance: '125.00',
      };
      const txMock = async (fn: Function) => fn(prisma);

      mockPrismaTransaction.mockImplementation(txMock);
      mockTransactionFindFirst.mockResolvedValue({
        ...transaction,
        wallet,
        attachments: [],
        destinationWallet: null,
      });
      mockWalletFindUnique.mockResolvedValue(wallet);
      mockQueryRaw.mockResolvedValue(undefined);
      mockWalletUpdate.mockResolvedValue({});
      mockTransactionHistoryCreate.mockResolvedValue({});
      mockTransactionDelete.mockResolvedValue({});
      mockTransactionAttachmentDeleteMany.mockResolvedValue({});
      mockUserFindUnique.mockResolvedValue(null);

      await deleteTransaction('tx-1', { ownerId: 'owner-1', role: 'OWNER' }, 'user-1');

      const updateCall = mockWalletUpdate.mock.calls[0][0];
      expect(updateCall.data.currentBalance).toBe(100);
    });

    it('revertir saldo EXPENSE: currentBalance + amount', async () => {
      const transaction = {
        id: 'tx-1',
        walletId: 'wallet-1',
        destinationWalletId: null,
        amount: '25.00',
        movementType: 'EXPENSE',
      };
      const wallet = {
        id: 'wallet-1',
        ownerId: 'owner-1',
        currentBalance: '75.00',
      };
      const txMock = async (fn: Function) => fn(prisma);

      mockPrismaTransaction.mockImplementation(txMock);
      mockTransactionFindFirst.mockResolvedValue({
        ...transaction,
        wallet,
        attachments: [],
        destinationWallet: null,
      });
      mockWalletFindUnique.mockResolvedValue(wallet);
      mockQueryRaw.mockResolvedValue(undefined);
      mockWalletUpdate.mockResolvedValue({});
      mockTransactionHistoryCreate.mockResolvedValue({});
      mockTransactionDelete.mockResolvedValue({});
      mockTransactionAttachmentDeleteMany.mockResolvedValue({});
      mockUserFindUnique.mockResolvedValue(null);

      await deleteTransaction('tx-1', { ownerId: 'owner-1', role: 'OWNER' }, 'user-1');

      const updateCall = mockWalletUpdate.mock.calls[0][0];
      expect(updateCall.data.currentBalance).toBe(100);
    });

    it('revertir ambos wallets en TRANSFER', async () => {
      const transaction = {
        id: 'tx-1',
        walletId: 'wallet-1',
        destinationWalletId: 'wallet-2',
        amount: '25.00',
        movementType: 'TRANSFER',
      };
      const sourceBefore = {
        id: 'wallet-1',
        ownerId: 'owner-1',
        currentBalance: '75.00',
      };
      const destBefore = {
        id: 'wallet-2',
        ownerId: 'owner-1',
        currentBalance: '35.00',
      };
      const txMock = async (fn: Function) => fn(prisma);

      mockPrismaTransaction.mockImplementation(txMock);
      mockTransactionFindFirst.mockResolvedValue({
        ...transaction,
        wallet: sourceBefore,
        attachments: [],
        destinationWallet: destBefore,
      });
      mockWalletFindUnique.mockImplementation((opts) => {
        if (opts.where.id === 'wallet-1') return Promise.resolve(sourceBefore);
        if (opts.where.id === 'wallet-2') return Promise.resolve(destBefore);
        return Promise.resolve(undefined);
      });
      mockQueryRaw.mockResolvedValue(undefined);
      mockWalletUpdate.mockResolvedValue({});
      mockTransactionHistoryCreate.mockResolvedValue({});
      mockTransactionDelete.mockResolvedValue({});
      mockTransactionAttachmentDeleteMany.mockResolvedValue({});
      mockUserFindUnique.mockResolvedValue(null);

      await deleteTransaction('tx-1', { ownerId: 'owner-1', role: 'OWNER' }, 'user-1');

      expect(mockWalletUpdate).toHaveBeenCalledTimes(2);
    });

    it('crear TransactionHistory: action=DELETE, oldSnapshot=transaction, newSnapshot={}', async () => {
      const transaction = {
        id: 'tx-1',
        walletId: 'wallet-1',
        destinationWalletId: null,
        amount: '25.00',
        movementType: 'INCOME',
      };
      const wallet = {
        id: 'wallet-1',
        ownerId: 'owner-1',
        currentBalance: '125.00',
      };
      const txMock = async (fn: Function) => fn(prisma);

      mockPrismaTransaction.mockImplementation(txMock);
      mockTransactionFindFirst.mockResolvedValue({
        ...transaction,
        wallet,
        attachments: [],
        destinationWallet: null,
      });
      mockWalletFindUnique.mockResolvedValue(wallet);
      mockQueryRaw.mockResolvedValue(undefined);
      mockWalletUpdate.mockResolvedValue({});
      mockTransactionHistoryCreate.mockResolvedValue({});
      mockTransactionDelete.mockResolvedValue({});
      mockTransactionAttachmentDeleteMany.mockResolvedValue({});
      mockUserFindUnique.mockResolvedValue(null);

      await deleteTransaction('tx-1', { ownerId: 'owner-1', role: 'OWNER' }, 'user-1');

      expect(mockTransactionHistoryCreate).toHaveBeenCalled();
      const histCall = mockTransactionHistoryCreate.mock.calls[0][0];
      expect(histCall.data.action).toBe('DELETE');
      expect(histCall.data.oldSnapshot).toBeDefined();
      expect(histCall.data.newSnapshot).toBeDefined();
    });

    it('transacción no encontrada → 404', async () => {
      mockTransactionFindFirst.mockResolvedValue(null);

      await expect(
        deleteTransaction('tx-1', { ownerId: 'owner-1', role: 'OWNER' }, 'user-1'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('owner incorrecto → 403', async () => {
      const transaction = {
        id: 'tx-1',
        walletId: 'wallet-1',
        amount: '25.00',
        movementType: 'INCOME',
      };
      const wallet = {
        id: 'wallet-1',
        ownerId: 'owner-2',
        currentBalance: '125.00',
      };

      mockTransactionFindFirst.mockResolvedValue({
        ...transaction,
        wallet,
        attachments: [],
        destinationWallet: null,
      });

      await expect(
        deleteTransaction('tx-1', { ownerId: 'owner-1', role: 'OWNER' }, 'user-1'),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('soft-deleted transaction retorna 404 sin tocar balances ni history', async () => {
      mockTransactionFindFirst.mockResolvedValue(null); // findFirst con deletedAt:null no encuentra nada
      await expect(
        deleteTransaction('tx-1', { ownerId: 'owner-1', role: 'OWNER' }, 'user-1'),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(mockWalletUpdate).not.toHaveBeenCalled();
      expect(mockTransactionHistoryCreate).not.toHaveBeenCalled();
    });

    it('updateTransaction rechaza transacción soft-deleted antes de mutar wallet', async () => {
      const txMock = async (fn: Function) => fn(prisma);
      mockPrismaTransaction.mockImplementation(txMock);
      mockTransactionFindFirst.mockResolvedValue(null); // soft-deleted o no existe
      await expect(
        updateTransaction('tx-1', { description: 'new' }, 'user-1', { ownerId: 'owner-1', role: 'OWNER' }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(mockWalletUpdate).not.toHaveBeenCalled();
    });
  });
});
