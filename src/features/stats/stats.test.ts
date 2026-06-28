import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getActivityStats } from './stats.service';

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

const day = (iso: string) => new Date(iso);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-28T12:00:00Z'));
});

afterEach(() => vi.useRealTimers());

describe('getActivityStats', () => {
  it('retorna zeros cuando el usuario no tiene wallets', async () => {
    mockWallets.mockResolvedValue([]);

    const result = await getActivityStats('user-1');

    expect(result).toEqual({ currentStreak: 0, longestStreak: 0, daysActiveThisMonth: 0, totalMovements: 0, firstMovementAt: null });
  });

  it('retorna zeros cuando tiene wallets pero no hay transacciones', async () => {
    mockWallets.mockResolvedValue([{ id: 'w1' }]);
    mockTxs.mockResolvedValue([]);

    const result = await getActivityStats('user-1');

    expect(result).toEqual({ currentStreak: 0, longestStreak: 0, daysActiveThisMonth: 0, totalMovements: 0, firstMovementAt: null });
  });

  it('calcula racha actual de 3 días consecutivos incluyendo hoy', async () => {
    mockWallets.mockResolvedValue([{ id: 'w1' }]);
    mockTxs.mockResolvedValue([
      { createdAt: day('2026-06-26T10:00:00Z') },
      { createdAt: day('2026-06-27T10:00:00Z') },
      { createdAt: day('2026-06-28T10:00:00Z') },
    ]);

    const result = await getActivityStats('user-1');

    expect(result.currentStreak).toBe(3);
  });

  it('racha actual es 0 si no hay actividad hoy', async () => {
    mockWallets.mockResolvedValue([{ id: 'w1' }]);
    mockTxs.mockResolvedValue([
      { createdAt: day('2026-06-25T10:00:00Z') },
      { createdAt: day('2026-06-26T10:00:00Z') },
    ]);

    const result = await getActivityStats('user-1');

    expect(result.currentStreak).toBe(0);
  });

  it('daysActiveThisMonth cuenta solo días del mes actual (junio 2026)', async () => {
    mockWallets.mockResolvedValue([{ id: 'w1' }]);
    mockTxs.mockResolvedValue([
      { createdAt: day('2026-05-31T10:00:00Z') }, // mayo — no cuenta
      { createdAt: day('2026-06-01T10:00:00Z') },
      { createdAt: day('2026-06-28T10:00:00Z') },
    ]);

    const result = await getActivityStats('user-1');

    expect(result.daysActiveThisMonth).toBe(2);
  });

  it('totalMovements cuenta todas las transacciones del array', async () => {
    mockWallets.mockResolvedValue([{ id: 'w1' }]);
    mockTxs.mockResolvedValue([
      { createdAt: day('2026-06-27T10:00:00Z') },
      { createdAt: day('2026-06-27T15:00:00Z') },
      { createdAt: day('2026-06-28T10:00:00Z') },
    ]);

    const result = await getActivityStats('user-1');

    expect(result.totalMovements).toBe(3);
  });

  it('longestStreak calcula la racha más larga histórica', async () => {
    mockWallets.mockResolvedValue([{ id: 'w1' }]);
    mockTxs.mockResolvedValue([
      { createdAt: day('2026-06-01T10:00:00Z') },
      { createdAt: day('2026-06-02T10:00:00Z') },
      { createdAt: day('2026-06-03T10:00:00Z') },
      { createdAt: day('2026-06-10T10:00:00Z') }, // rompe la racha
      { createdAt: day('2026-06-28T10:00:00Z') },
    ]);

    const result = await getActivityStats('user-1');

    expect(result.longestStreak).toBe(3);
  });
});
