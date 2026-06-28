import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getInsights } from './insights.service';

vi.mock('../../core/database/prisma', () => ({
  prisma: {
    wallet: { findMany: vi.fn() },
    transaction: { findMany: vi.fn() },
  },
}));

vi.mock('../../core/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-at-least-32-characters-long',
    JWT_EXPIRES_IN: '7d',
    ENCRYPTION_KEY: '0'.repeat(64),
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    GOOGLE_REDIRECT_URI: 'http://localhost/callback',
  },
}));

import { prisma } from '../../core/database/prisma';

const mockWallets = prisma.wallet.findMany as ReturnType<typeof vi.fn>;
const mockTxs = prisma.transaction.findMany as ReturnType<typeof vi.fn>;
const ownerCtx = { ownerId: 'owner-1' };

beforeEach(() => vi.clearAllMocks());

describe('getInsights', () => {
  it('retorna zeros cuando no hay wallets', async () => {
    mockWallets.mockResolvedValue([]);
    const result = await getInsights(ownerCtx, '2026-06');
    expect(result.totalIncome).toBe('0.00');
    expect(result.totalExpense).toBe('0.00');
    expect(result.topCategories).toHaveLength(0);
    expect(result.biggestExpense).toBeNull();
  });

  it('calcula totalExpense y totalIncome del mes correctamente', async () => {
    mockWallets.mockResolvedValue([{ id: 'w1' }]);
    mockTxs
      .mockResolvedValueOnce([ // mes actual
        { movementType: 'EXPENSE', amount: 1000, categoryId: 'cat-1', id: 'tx-1', description: 'Comida' },
        { movementType: 'EXPENSE', amount: 500,  categoryId: 'cat-2', id: 'tx-2', description: null },
        { movementType: 'INCOME',  amount: 5000, categoryId: 'cat-3', id: 'tx-3', description: 'Sueldo' },
      ])
      .mockResolvedValueOnce([]); // mes anterior

    const result = await getInsights(ownerCtx, '2026-06');
    expect(result.totalExpense).toBe('1500.00');
    expect(result.totalIncome).toBe('5000.00');
  });

  it('calcula comparación con mes anterior', async () => {
    mockWallets.mockResolvedValue([{ id: 'w1' }]);
    mockTxs
      .mockResolvedValueOnce([{ movementType: 'EXPENSE', amount: 1100, categoryId: 'cat-1', id: 'tx-1', description: null }])
      .mockResolvedValueOnce([{ movementType: 'EXPENSE', amount: 1000, categoryId: 'cat-1', id: 'tx-old', description: null }]);

    const result = await getInsights(ownerCtx, '2026-06');
    expect(result.vsPreviousMonth.expenseDeltaPct).toBe(10); // +10%
  });

  it('retorna top 3 categorías por gasto ordenadas desc', async () => {
    mockWallets.mockResolvedValue([{ id: 'w1' }]);
    mockTxs
      .mockResolvedValueOnce([
        { movementType: 'EXPENSE', amount: 100, categoryId: 'cat-A', id: 'tx-1', description: null },
        { movementType: 'EXPENSE', amount: 500, categoryId: 'cat-B', id: 'tx-2', description: null },
        { movementType: 'EXPENSE', amount: 300, categoryId: 'cat-C', id: 'tx-3', description: null },
        { movementType: 'EXPENSE', amount: 50,  categoryId: 'cat-D', id: 'tx-4', description: null },
      ])
      .mockResolvedValueOnce([]);

    const result = await getInsights(ownerCtx, '2026-06');
    expect(result.topCategories).toHaveLength(3);
    expect(result.topCategories[0].categoryId).toBe('cat-B');
    expect(result.topCategories[1].categoryId).toBe('cat-C');
  });

  it('retorna biggestExpense con el mayor gasto individual', async () => {
    mockWallets.mockResolvedValue([{ id: 'w1' }]);
    mockTxs
      .mockResolvedValueOnce([
        { movementType: 'EXPENSE', amount: 200, categoryId: 'cat-1', id: 'tx-small', description: 'Chico' },
        { movementType: 'EXPENSE', amount: 800, categoryId: 'cat-1', id: 'tx-big',   description: 'Grande' },
      ])
      .mockResolvedValueOnce([]);

    const result = await getInsights(ownerCtx, '2026-06');
    expect(result.biggestExpense?.transactionId).toBe('tx-big');
    expect(result.biggestExpense?.amount).toBe('800.00');
  });
});
