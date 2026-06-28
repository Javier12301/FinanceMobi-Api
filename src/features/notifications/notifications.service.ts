import { prisma } from '../../core/database/prisma';
import { AppError } from '../../core/errors';
import type { RegisterDeviceInput, UpdatePrefsInput } from './notifications.schema';

export async function registerDevice(userId: string, input: RegisterDeviceInput) {
  return prisma.notificationDevice.upsert({
    where: { userId_token: { userId, token: input.token } },
    update: { platform: input.platform },
    create: { userId, token: input.token, platform: input.platform },
  });
}

export async function deleteDevice(userId: string, token: string) {
  const device = await prisma.notificationDevice.findUnique({
    where: { userId_token: { userId, token } },
  });
  if (!device) throw new AppError(404, 'Dispositivo no encontrado');
  await prisma.notificationDevice.delete({ where: { userId_token: { userId, token } } });
}

export async function getPrefs(userId: string) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export async function updatePrefs(userId: string, input: UpdatePrefsInput) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    update: { ...input },
    create: { userId, ...input },
  });
}

// Service-level only — no endpoint expuesto. Calcula candidatos para notificaciones.
export async function getNotificationCandidates(now: Date) {
  // F11: partir de usuarios con dispositivos registrados, no de prefs (evita ignorar users sin fila de prefs)
  const allDevices = await prisma.notificationDevice.findMany({
    select: { userId: true, token: true },
  });

  const tokensByUser = new Map<string, string[]>();
  for (const d of allDevices) {
    if (!tokensByUser.has(d.userId)) tokensByUser.set(d.userId, []);
    tokensByUser.get(d.userId)!.push(d.token);
  }

  if (tokensByUser.size === 0) return [];

  const persistedPrefs = await prisma.notificationPreference.findMany({
    where: { userId: { in: [...tokensByUser.keys()] } },
  });
  const prefsByUser = new Map(persistedPrefs.map((p) => [p.userId, p]));

  const DEFAULT_PREFS = { dailyReminder: true, reminderHour: '21:00', budgetAlerts: true, recurringAlerts: true };
  const prefsFor = (userId: string) => prefsByUser.get(userId) ?? DEFAULT_PREFS;

  const [nowHH, nowMM] = [now.getUTCHours().toString().padStart(2, '0'), now.getUTCMinutes().toString().padStart(2, '0')];
  const nowTime = `${nowHH}:${nowMM}`;

  const candidates: Array<{ userId: string; tokens: string[]; reason: string }> = [];

  // Daily reminder
  for (const [userId, tokens] of tokensByUser) {
    const pref = prefsFor(userId);
    if (pref.dailyReminder && pref.reminderHour === nowTime) {
      candidates.push({ userId, tokens, reason: 'daily_reminder' });
    }
  }

  // Recurring rules vencidas sin autoPost — respetar recurringAlerts
  const dueRules = await prisma.recurringRule.findMany({
    where: { nextRunDate: { lte: now }, autoPost: false, active: true },
    select: { ownerId: true },
  });
  for (const rule of dueRules) {
    const tokens = tokensByUser.get(rule.ownerId);
    if (!tokens?.length) continue;
    if (!prefsFor(rule.ownerId).recurringAlerts) continue;
    candidates.push({ userId: rule.ownerId, tokens, reason: 'recurring_due' });
  }

  // F10: Budget thresholds — filtrar solo EXPENSE dentro del mes exacto
  const nowMonth = now.toISOString().slice(0, 7);
  const monthStart = new Date(`${nowMonth}-01T00:00:00Z`);
  const [year, month] = nowMonth.split('-').map(Number);
  const nextMonthStart = new Date(Date.UTC(year, month, 1)); // month string es 1-based; Date.UTC usa 0-based → avanza un mes
  const budgets = await prisma.budget.findMany({
    where: { month: nowMonth },
    include: {
      category: {
        include: {
          transactions: {
            where: { deletedAt: null, movementType: 'EXPENSE', date: { gte: monthStart, lt: nextMonthStart } },
          },
        },
      },
    },
  });
  for (const budget of budgets) {
    const tokens = tokensByUser.get(budget.ownerId);
    if (!tokens?.length) continue;
    if (!prefsFor(budget.ownerId).budgetAlerts) continue;
    const spent = budget.category.transactions.reduce((acc: number, t: any) => acc + Number(t.amount), 0);
    const pct = Number(budget.limit) > 0 ? spent / Number(budget.limit) : 0;
    if (pct >= 0.8) {
      candidates.push({ userId: budget.ownerId, tokens, reason: pct >= 1 ? 'budget_exceeded' : 'budget_warning' });
    }
  }

  // F12: Streak risk a las 22:00 — solo usuarios CON actividad histórica previa a hoy
  if (nowTime === '22:00') {
    const today = now.toISOString().slice(0, 10);
    const todayStart = new Date(`${today}T00:00:00Z`);
    const [todayTxs, historicalTxs] = await Promise.all([
      prisma.transaction.findMany({
        where: { date: { gte: todayStart }, deletedAt: null },
        select: { wallet: { select: { ownerId: true } } },
      }),
      prisma.transaction.findMany({
        where: { date: { lt: todayStart }, deletedAt: null },
        select: { wallet: { select: { ownerId: true } } },
      }),
    ]);
    const activeToday = new Set(todayTxs.map((t: any) => t.wallet.ownerId));
    const hasHistory = new Set(historicalTxs.map((t: any) => t.wallet.ownerId));

    for (const [userId, tokens] of tokensByUser) {
      if (activeToday.has(userId)) continue;
      if (!hasHistory.has(userId)) continue;
      candidates.push({ userId, tokens, reason: 'streak_risk' });
    }
  }

  return candidates;
}
