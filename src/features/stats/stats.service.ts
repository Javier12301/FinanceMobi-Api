import { prisma } from '../../core/database/prisma';

export async function getActivityStats(userId: string) {
  const wallets = await prisma.wallet.findMany({ where: { ownerId: userId }, select: { id: true } });
  const walletIds = wallets.map((w) => w.id);

  if (walletIds.length === 0) {
    return { currentStreak: 0, longestStreak: 0, daysActiveThisMonth: 0, totalMovements: 0, firstMovementAt: null };
  }

  const txs = await prisma.transaction.findMany({
    where: { walletId: { in: walletIds }, deletedAt: null },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (txs.length === 0) {
    return { currentStreak: 0, longestStreak: 0, daysActiveThisMonth: 0, totalMovements: 0, firstMovementAt: null };
  }

  const activeDays = new Set(txs.map((t) => t.createdAt.toISOString().slice(0, 10)));
  const sortedDays = [...activeDays].sort();

  const today = new Date().toISOString().slice(0, 10);

  // Racha actual: retroceder desde hoy
  let currentStreak = 0;
  let checkDay = today;
  while (activeDays.has(checkDay)) {
    currentStreak++;
    const d = new Date(checkDay);
    d.setUTCDate(d.getUTCDate() - 1);
    checkDay = d.toISOString().slice(0, 10);
  }

  // Racha más larga
  let longestStreak = 1;
  let streak = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const diffMs = new Date(sortedDays[i]).getTime() - new Date(sortedDays[i - 1]).getTime();
    if (diffMs === 86400000) {
      streak++;
    } else {
      longestStreak = Math.max(longestStreak, streak);
      streak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, streak);

  const nowMonth = today.slice(0, 7);
  const daysActiveThisMonth = sortedDays.filter((d) => d.startsWith(nowMonth)).length;

  return {
    currentStreak,
    longestStreak,
    daysActiveThisMonth,
    totalMovements: txs.length,
    firstMovementAt: txs[0].createdAt.toISOString(),
  };
}
