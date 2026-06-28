import { prisma } from '../../core/database/prisma';

interface OwnerContext { ownerId: string }

export async function getInsights(ownerContext: OwnerContext, month: string) {
  // month formato YYYY-MM
  const [year, mon] = month.split('-').map(Number);
  const from = new Date(year, mon - 1, 1);
  const to = new Date(year, mon, 1); // exclusivo

  const prevMonth = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`;
  const [prevYear, prevMon] = prevMonth.split('-').map(Number);
  const prevFrom = new Date(prevYear, prevMon - 1, 1);
  const prevTo = new Date(prevYear, prevMon, 1);

  const wallets = await prisma.wallet.findMany({ where: { ownerId: ownerContext.ownerId }, select: { id: true } });
  const walletIds = wallets.map((w) => w.id);

  if (walletIds.length === 0) {
    return emptyInsights(month);
  }

  const baseWhere = (f: Date, t: Date) => ({
    walletId: { in: walletIds },
    deletedAt: null,
    date: { gte: f, lt: t },
    movementType: { in: ['INCOME', 'EXPENSE'] as ('INCOME' | 'EXPENSE')[] },
  });

  const [currentTxs, prevTxs] = await Promise.all([
    prisma.transaction.findMany({ where: baseWhere(from, to), select: { movementType: true, amount: true, categoryId: true, id: true, description: true } }),
    prisma.transaction.findMany({ where: baseWhere(prevFrom, prevTo), select: { movementType: true, amount: true } }),
  ]);

  const sum = (txs: Array<{ movementType: string; amount: any }>, type: string) =>
    txs.filter((t) => t.movementType === type).reduce((acc, t) => acc + Number(t.amount), 0);

  const totalIncome = sum(currentTxs, 'INCOME');
  const totalExpense = sum(currentTxs, 'EXPENSE');
  const prevIncome = sum(prevTxs, 'INCOME');
  const prevExpense = sum(prevTxs, 'EXPENSE');

  const pct = (curr: number, prev: number) => prev === 0 ? 0 : Math.round(((curr - prev) / prev) * 1000) / 10;

  // Top categorías por gasto
  const catTotals: Record<string, number> = {};
  for (const tx of currentTxs.filter((t) => t.movementType === 'EXPENSE')) {
    catTotals[tx.categoryId] = (catTotals[tx.categoryId] ?? 0) + Number(tx.amount);
  }
  const topCategories = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([categoryId, total]) => ({
      categoryId,
      total: total.toFixed(2),
      pct: totalExpense > 0 ? Math.round((total / totalExpense) * 1000) / 10 : 0,
    }));

  // Mayor gasto individual
  const expenses = currentTxs.filter((t) => t.movementType === 'EXPENSE');
  const biggest = expenses.length > 0
    ? expenses.reduce((a, b) => Number(a.amount) > Number(b.amount) ? a : b)
    : null;

  return {
    month,
    totalIncome: totalIncome.toFixed(2),
    totalExpense: totalExpense.toFixed(2),
    vsPreviousMonth: {
      expenseDeltaPct: pct(totalExpense, prevExpense),
      incomeDeltaPct: pct(totalIncome, prevIncome),
    },
    topCategories,
    biggestExpense: biggest
      ? { transactionId: biggest.id, amount: Number(biggest.amount).toFixed(2), description: biggest.description ?? null }
      : null,
  };
}

function emptyInsights(month: string) {
  return {
    month,
    totalIncome: '0.00',
    totalExpense: '0.00',
    vsPreviousMonth: { expenseDeltaPct: 0, incomeDeltaPct: 0 },
    topCategories: [],
    biggestExpense: null,
  };
}
