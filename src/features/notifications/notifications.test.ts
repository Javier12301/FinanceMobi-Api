import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerDevice, deleteDevice, getPrefs, updatePrefs, getNotificationCandidates } from './notifications.service';
import { AppError } from '../../core/errors';

vi.mock('../../core/database/prisma', () => ({
  prisma: {
    notificationDevice: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    notificationPreference: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    recurringRule: { findMany: vi.fn() },
    budget: { findMany: vi.fn() },
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

const mockDeviceUpsert = prisma.notificationDevice.upsert as ReturnType<typeof vi.fn>;
const mockDeviceFindUnique = prisma.notificationDevice.findUnique as ReturnType<typeof vi.fn>;
const mockDeviceDelete = prisma.notificationDevice.delete as ReturnType<typeof vi.fn>;
const mockDeviceFindMany = prisma.notificationDevice.findMany as ReturnType<typeof vi.fn>;
const mockPrefUpsert = prisma.notificationPreference.upsert as ReturnType<typeof vi.fn>;
const mockPrefFindMany = prisma.notificationPreference.findMany as ReturnType<typeof vi.fn>;
const mockRulesFindMany = prisma.recurringRule.findMany as ReturnType<typeof vi.fn>;
const mockBudgetFindMany = prisma.budget.findMany as ReturnType<typeof vi.fn>;
const mockTxFindMany = prisma.transaction.findMany as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('registerDevice', () => {
  it('hace upsert del device por userId+token', async () => {
    mockDeviceUpsert.mockResolvedValue({ id: 'd1' });
    await registerDevice('user-1', { token: 'tok123', platform: 'android' });
    expect(mockDeviceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_token: { userId: 'user-1', token: 'tok123' } } }),
    );
  });

  it('permite registrar múltiples dispositivos para el mismo usuario', async () => {
    mockDeviceUpsert.mockResolvedValueOnce({ id: 'd1' }).mockResolvedValueOnce({ id: 'd2' });
    await registerDevice('user-1', { token: 'tok-android', platform: 'android' });
    await registerDevice('user-1', { token: 'tok-ios', platform: 'ios' });
    expect(mockDeviceUpsert).toHaveBeenCalledTimes(2);
  });
});

describe('deleteDevice', () => {
  it('lanza 404 si el device no existe para ese usuario', async () => {
    mockDeviceFindUnique.mockResolvedValue(null);
    await expect(deleteDevice('user-1', 'tok-inexistente')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('elimina el device por userId+token cuando existe', async () => {
    mockDeviceFindUnique.mockResolvedValue({ id: 'd1', userId: 'user-1', token: 'tok123' });
    mockDeviceDelete.mockResolvedValue({});
    await deleteDevice('user-1', 'tok123');
    expect(mockDeviceDelete).toHaveBeenCalledWith({ where: { userId_token: { userId: 'user-1', token: 'tok123' } } });
  });
});

describe('getPrefs', () => {
  it('hace upsert con defaults si no existen preferencias', async () => {
    const defaults = { userId: 'u1', dailyReminder: true, budgetAlerts: true, recurringAlerts: true, reminderHour: '21:00' };
    mockPrefUpsert.mockResolvedValue(defaults);
    const result = await getPrefs('u1');
    expect(result.dailyReminder).toBe(true);
    expect(result.reminderHour).toBe('21:00');
  });
});

describe('updatePrefs', () => {
  it('actualiza solo los campos enviados', async () => {
    mockPrefUpsert.mockResolvedValue({ userId: 'u1', dailyReminder: false, budgetAlerts: true, recurringAlerts: true, reminderHour: '21:00' });
    await updatePrefs('u1', { dailyReminder: false });
    expect(mockPrefUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { dailyReminder: false } }),
    );
  });
});

// Helpers para getNotificationCandidates (nueva estructura: devices separados de prefs)
const makePref = (userId: string, overrides: any = {}) => ({
  userId,
  dailyReminder: true,
  recurringAlerts: true,
  budgetAlerts: true,
  reminderHour: '21:00',
  ...overrides,
});

const makeDevice = (userId: string, token?: string) => ({ userId, token: token ?? `tok-${userId}` });

describe('getNotificationCandidates', () => {
  it('incluye candidatos de daily reminder cuando coincide la hora', async () => {
    mockDeviceFindMany.mockResolvedValue([makeDevice('u1')]);
    mockPrefFindMany.mockResolvedValue([makePref('u1')]);
    mockRulesFindMany.mockResolvedValue([]);
    mockBudgetFindMany.mockResolvedValue([]);

    const result = await getNotificationCandidates(new Date('2026-06-28T21:00:00Z'));

    expect(result).toContainEqual(expect.objectContaining({ userId: 'u1', reason: 'daily_reminder' }));
  });

  it('no incluye candidatos si la hora no coincide', async () => {
    mockDeviceFindMany.mockResolvedValue([makeDevice('u1')]);
    mockPrefFindMany.mockResolvedValue([makePref('u1')]);
    mockRulesFindMany.mockResolvedValue([]);
    mockBudgetFindMany.mockResolvedValue([]);

    const result = await getNotificationCandidates(new Date('2026-06-28T15:00:00Z'));

    expect(result.filter((c) => c.reason === 'daily_reminder')).toHaveLength(0);
  });

  it('incluye candidatos de recurring_due cuando hay reglas vencidas', async () => {
    mockDeviceFindMany.mockResolvedValue([makeDevice('u2')]);
    mockPrefFindMany.mockResolvedValue([makePref('u2')]);
    mockRulesFindMany.mockResolvedValue([{ ownerId: 'u2' }]);
    mockBudgetFindMany.mockResolvedValue([]);

    const result = await getNotificationCandidates(new Date('2026-06-28T10:00:00Z'));

    expect(result).toContainEqual(expect.objectContaining({ userId: 'u2', reason: 'recurring_due' }));
  });

  it('no incluye usuarios sin dispositivos registrados', async () => {
    mockDeviceFindMany.mockResolvedValue([]); // sin devices → retorna vacío de inmediato
    mockPrefFindMany.mockResolvedValue([]);
    mockRulesFindMany.mockResolvedValue([]);
    mockBudgetFindMany.mockResolvedValue([]);

    const result = await getNotificationCandidates(new Date('2026-06-28T21:00:00Z'));

    expect(result).toHaveLength(0);
  });

  it('no notifica recurring_due si recurringAlerts = false', async () => {
    mockDeviceFindMany.mockResolvedValue([makeDevice('u4')]);
    mockPrefFindMany.mockResolvedValue([makePref('u4', { recurringAlerts: false })]);
    mockRulesFindMany.mockResolvedValue([{ ownerId: 'u4' }]);
    mockBudgetFindMany.mockResolvedValue([]);

    const result = await getNotificationCandidates(new Date('2026-06-28T10:00:00Z'));

    expect(result.filter((c) => c.userId === 'u4' && c.reason === 'recurring_due')).toHaveLength(0);
  });

  it('incluye budget_warning cuando gasto supera 80% del límite', async () => {
    mockDeviceFindMany.mockResolvedValue([makeDevice('u5')]);
    mockPrefFindMany.mockResolvedValue([makePref('u5')]);
    mockRulesFindMany.mockResolvedValue([]);
    mockBudgetFindMany.mockResolvedValue([{
      ownerId: 'u5',
      limit: 1000,
      category: { transactions: [{ amount: 850 }] },
    }]);

    const result = await getNotificationCandidates(new Date('2026-06-28T10:00:00Z'));

    expect(result).toContainEqual(expect.objectContaining({ userId: 'u5', reason: 'budget_warning' }));
  });

  it('no notifica budget si budgetAlerts = false', async () => {
    mockDeviceFindMany.mockResolvedValue([makeDevice('u6')]);
    mockPrefFindMany.mockResolvedValue([makePref('u6', { budgetAlerts: false })]);
    mockRulesFindMany.mockResolvedValue([]);
    mockBudgetFindMany.mockResolvedValue([{
      ownerId: 'u6',
      limit: 1000,
      category: { transactions: [{ amount: 900 }] },
    }]);

    const result = await getNotificationCandidates(new Date('2026-06-28T10:00:00Z'));

    expect(result.filter((c) => c.userId === 'u6')).toHaveLength(0);
  });

  // F10: budget debe filtrar solo EXPENSE dentro del mes exacto
  it('verifica que budget filtra por movementType EXPENSE y rango de fecha del mes', async () => {
    mockDeviceFindMany.mockResolvedValue([makeDevice('u5b')]);
    mockPrefFindMany.mockResolvedValue([makePref('u5b')]);
    mockRulesFindMany.mockResolvedValue([]);
    mockBudgetFindMany.mockResolvedValue([]);

    await getNotificationCandidates(new Date('2026-06-28T10:00:00Z'));

    expect(mockBudgetFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          category: expect.objectContaining({
            include: expect.objectContaining({
              transactions: expect.objectContaining({
                where: expect.objectContaining({
                  movementType: 'EXPENSE',
                  date: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('incluye streak_risk a las 22:00 para usuarios sin actividad hoy', async () => {
    mockDeviceFindMany.mockResolvedValue([makeDevice('u7')]);
    mockPrefFindMany.mockResolvedValue([makePref('u7')]);
    mockRulesFindMany.mockResolvedValue([]);
    mockBudgetFindMany.mockResolvedValue([]);
    mockTxFindMany
      .mockResolvedValueOnce([]) // sin actividad hoy
      .mockResolvedValueOnce([{ wallet: { ownerId: 'u7' } }]); // con actividad histórica

    const result = await getNotificationCandidates(new Date('2026-06-28T22:00:00Z'));

    expect(result).toContainEqual(expect.objectContaining({ userId: 'u7', reason: 'streak_risk' }));
  });

  // F11: usuario con device pero sin prefs persistidas recibe candidatos con defaults
  it('incluye daily_reminder para usuario con device y sin prefs persistidas', async () => {
    mockDeviceFindMany.mockResolvedValue([makeDevice('u8')]);
    mockPrefFindMany.mockResolvedValue([]); // sin fila de prefs
    mockRulesFindMany.mockResolvedValue([]);
    mockBudgetFindMany.mockResolvedValue([]);

    const result = await getNotificationCandidates(new Date('2026-06-28T21:00:00Z'));

    expect(result).toContainEqual(expect.objectContaining({ userId: 'u8', reason: 'daily_reminder' }));
  });

  // F12: streak_risk no se emite para usuarios sin actividad histórica
  it('no emite streak_risk para usuario sin actividad histórica', async () => {
    mockDeviceFindMany.mockResolvedValue([makeDevice('u9')]);
    mockPrefFindMany.mockResolvedValue([makePref('u9')]);
    mockRulesFindMany.mockResolvedValue([]);
    mockBudgetFindMany.mockResolvedValue([]);
    mockTxFindMany
      .mockResolvedValueOnce([]) // sin actividad hoy
      .mockResolvedValueOnce([]); // sin actividad histórica

    const result = await getNotificationCandidates(new Date('2026-06-28T22:00:00Z'));

    expect(result.filter((c) => c.userId === 'u9' && c.reason === 'streak_risk')).toHaveLength(0);
  });

  it('emite streak_risk para usuario con actividad histórica y sin actividad hoy', async () => {
    mockDeviceFindMany.mockResolvedValue([makeDevice('u10')]);
    mockPrefFindMany.mockResolvedValue([makePref('u10')]);
    mockRulesFindMany.mockResolvedValue([]);
    mockBudgetFindMany.mockResolvedValue([]);
    mockTxFindMany
      .mockResolvedValueOnce([]) // sin actividad hoy
      .mockResolvedValueOnce([{ wallet: { ownerId: 'u10' } }]); // con actividad histórica

    const result = await getNotificationCandidates(new Date('2026-06-28T22:00:00Z'));

    expect(result).toContainEqual(expect.objectContaining({ userId: 'u10', reason: 'streak_risk' }));
  });
});
