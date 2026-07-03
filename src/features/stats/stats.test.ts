import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getActivityStats, computeStreaks, recordCheckIn } from './stats.service';

vi.mock('../../core/database/prisma', () => ({
  prisma: {
    wallet: { findMany: vi.fn() },
    transaction: { findMany: vi.fn() },
    userDailyCheckIn: { findMany: vi.fn(), upsert: vi.fn() },
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
const mockCheckIns = (prisma as any).userDailyCheckIn.findMany as ReturnType<typeof vi.fn>;
const mockUpsert = (prisma as any).userDailyCheckIn.upsert as ReturnType<typeof vi.fn>;

const day = (iso: string) => new Date(iso);
const checkin = (isoDate: string) => ({ checkInDate: new Date(isoDate) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-28T12:00:00Z'));
  // defaults: sin check-ins ni movimientos salvo que el test los defina
  mockCheckIns.mockResolvedValue([]);
  mockWallets.mockResolvedValue([]);
  mockTxs.mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe('computeStreaks (racha pura)', () => {
  it('racha actual de 3 días consecutivos incluyendo hoy', () => {
    expect(computeStreaks(['2026-06-26', '2026-06-27', '2026-06-28'], '2026-06-28')).toEqual({ currentStreak: 3, longestStreak: 3 });
  });

  it('racha actual 0 si no entró hoy', () => {
    expect(computeStreaks(['2026-06-25', '2026-06-26'], '2026-06-28').currentStreak).toBe(0);
  });

  it('longestStreak toma la racha histórica más larga aunque la actual sea corta', () => {
    const days = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-10', '2026-06-28'];
    expect(computeStreaks(days, '2026-06-28').longestStreak).toBe(3);
  });

  it('sin días → 0/0', () => {
    expect(computeStreaks([], '2026-06-28')).toEqual({ currentStreak: 0, longestStreak: 0 });
  });
});

describe('getActivityStats', () => {
  it('zeros cuando no hay check-ins ni movimientos', async () => {
    const result = await getActivityStats('user-1');
    expect(result).toEqual({ currentStreak: 0, longestStreak: 0, daysActiveThisMonth: 0, totalMovements: 0, firstMovementAt: null });
  });

  it('racha se calcula desde los check-ins, no desde las transacciones', async () => {
    mockCheckIns.mockResolvedValue([checkin('2026-06-26'), checkin('2026-06-27'), checkin('2026-06-28')]);
    // aunque no haya transacciones, la racha es 3 por los check-ins
    const result = await getActivityStats('user-1');
    expect(result.currentStreak).toBe(3);
  });

  it('daysActiveThisMonth cuenta check-ins del mes actual', async () => {
    mockCheckIns.mockResolvedValue([checkin('2026-05-31'), checkin('2026-06-01'), checkin('2026-06-28')]);
    const result = await getActivityStats('user-1');
    expect(result.daysActiveThisMonth).toBe(2);
  });

  it('totalMovements y firstMovementAt salen de las transacciones de las billeteras propias', async () => {
    mockWallets.mockResolvedValue([{ id: 'w1' }]);
    mockTxs.mockResolvedValue([
      { createdAt: day('2026-06-27T10:00:00Z') },
      { createdAt: day('2026-06-28T10:00:00Z') },
    ]);
    const result = await getActivityStats('user-1');
    expect(result.totalMovements).toBe(2);
    expect(result.firstMovementAt).toBe('2026-06-27T10:00:00.000Z');
  });
});

describe('recordCheckIn', () => {
  it('upsert idempotente por [userId, checkInDate] con la fecha de hoy', async () => {
    await recordCheckIn('user-1');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_checkInDate: { userId: 'user-1', checkInDate: new Date('2026-06-28') } },
        create: { userId: 'user-1', checkInDate: new Date('2026-06-28') },
        update: {},
      }),
    );
  });
});
