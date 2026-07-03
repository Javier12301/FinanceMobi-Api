import { prisma } from '../../core/database/prisma';

/**
 * Calcula la racha actual (retrocediendo desde hoy) y la más larga a partir de un set de
 * días 'YYYY-MM-DD'. Función pura para testear la aritmética sin mocks.
 * ponytail: días en UTC, igual que el resto del stack; el caso de medianoche por zona horaria
 * se resuelve más adelante si molesta.
 */
export function computeStreaks(days: string[], today: string): { currentStreak: number; longestStreak: number } {
  if (days.length === 0) return { currentStreak: 0, longestStreak: 0 };
  const set = new Set(days);
  const sorted = [...set].sort();

  let currentStreak = 0;
  let checkDay = today;
  while (set.has(checkDay)) {
    currentStreak++;
    const d = new Date(checkDay);
    d.setUTCDate(d.getUTCDate() - 1);
    checkDay = d.toISOString().slice(0, 10);
  }

  let longestStreak = 1;
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diffMs = new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime();
    if (diffMs === 86400000) streak++;
    else {
      longestStreak = Math.max(longestStreak, streak);
      streak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, streak);
  return { currentStreak, longestStreak };
}

/**
 * Stats del usuario AUTENTICADO (no del owner delegado):
 * - racha (currentStreak/longestStreak) y días activos del mes → desde los check-ins diarios.
 * - totalMovements / firstMovementAt → desde las transacciones de sus billeteras propias.
 */
export async function getActivityStats(userId: string) {
  const [checkIns, wallets] = await Promise.all([
    prisma.userDailyCheckIn.findMany({
      where: { userId },
      select: { checkInDate: true },
      orderBy: { checkInDate: 'asc' },
    }),
    prisma.wallet.findMany({ where: { ownerId: userId }, select: { id: true } }),
  ]);

  const walletIds = wallets.map((w) => w.id);
  const txs = walletIds.length
    ? await prisma.transaction.findMany({
        where: { walletId: { in: walletIds }, deletedAt: null },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  const today = new Date().toISOString().slice(0, 10);
  const checkinDays = checkIns.map((c) => c.checkInDate.toISOString().slice(0, 10));
  const { currentStreak, longestStreak } = computeStreaks(checkinDays, today);
  const nowMonth = today.slice(0, 7);
  const daysActiveThisMonth = checkinDays.filter((d) => d.startsWith(nowMonth)).length;

  return {
    currentStreak,
    longestStreak,
    daysActiveThisMonth,
    totalMovements: txs.length,
    firstMovementAt: txs.length ? txs[0].createdAt.toISOString() : null,
  };
}

/** Marca (idempotente) la entrada del día de hoy y devuelve los stats actualizados. */
export async function recordCheckIn(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const checkInDate = new Date(today);
  await prisma.userDailyCheckIn.upsert({
    where: { userId_checkInDate: { userId, checkInDate } },
    create: { userId, checkInDate },
    update: {},
  });
  return getActivityStats(userId);
}
