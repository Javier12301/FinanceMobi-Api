import { prisma } from '../../core/database/prisma';
import { AppError } from '../../core/errors';
import { payDebtInTx } from '../debts/debts.service';
import type { CreateRecurringRuleInput, UpdateRecurringRuleInput } from './recurring.schema';

interface OwnerContext {
  ownerId: string;
  role: 'OWNER' | 'SUPERVISOR' | 'ASESOR';
}

// F8: clamp al último día del mes para dayOfMonth 29-31
function clampToMonth(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

function calcFirstRunDate(startDate: Date, dayOfMonth: number): Date {
  const d = clampToMonth(startDate.getFullYear(), startDate.getMonth(), dayOfMonth);
  if (d <= startDate) {
    return clampToMonth(startDate.getFullYear(), startDate.getMonth() + 1, dayOfMonth);
  }
  return d;
}

function calcNextRunDate(fromDate: Date, dayOfMonth: number): Date {
  const next = new Date(fromDate);
  next.setMonth(next.getMonth() + 1);
  return clampToMonth(next.getFullYear(), next.getMonth(), dayOfMonth);
}

export async function listRules(ownerId: string) {
  return prisma.recurringRule.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createRule(ownerId: string, input: CreateRecurringRuleInput) {
  const wallet = await prisma.wallet.findUnique({ where: { id: input.walletId } });
  if (!wallet || wallet.ownerId !== ownerId) throw new AppError(404, 'Billetera no encontrada');

  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category || category.ownerId !== ownerId) throw new AppError(404, 'Categoría no encontrada');

  // F7: consistencia movementType vs categoría
  if (category.movementType !== input.movementType) {
    throw new AppError(400, `La categoría es de tipo ${category.movementType}, no ${input.movementType}`);
  }

  // F7: destinationWalletId solo válido en TRANSFER
  if (input.movementType !== 'TRANSFER' && input.destinationWalletId) {
    throw new AppError(400, 'destinationWalletId solo aplica a movimientos TRANSFER');
  }

  if (input.movementType === 'TRANSFER') {
    if (!input.destinationWalletId) throw new AppError(400, 'destinationWalletId requerido para TRANSFER');
    if (input.destinationWalletId === input.walletId) throw new AppError(400, 'walletId y destinationWalletId no pueden ser la misma billetera');
    const destWallet = await prisma.wallet.findUnique({ where: { id: input.destinationWalletId } });
    if (!destWallet || destWallet.ownerId !== ownerId) throw new AppError(404, 'Billetera destino no encontrada');
  }

  const startDate = new Date(input.startDate);
  const nextRunDate = calcFirstRunDate(startDate, input.dayOfMonth);

  return prisma.recurringRule.create({
    data: {
      ownerId,
      walletId: input.walletId,
      destinationWalletId: input.destinationWalletId,
      categoryId: input.categoryId,
      movementType: input.movementType,
      amount: input.amount,
      description: input.description,
      dayOfMonth: input.dayOfMonth,
      frequency: 'MONTHLY',
      autoPost: input.autoPost,
      startDate,
      endDate: input.endDate ? new Date(input.endDate) : null,
      nextRunDate,
      debtId: input.debtId ?? null,
    },
  });
}

export async function updateRule(ownerId: string, ruleId: string, input: UpdateRecurringRuleInput) {
  const rule = await prisma.recurringRule.findUnique({ where: { id: ruleId } });
  if (!rule || rule.ownerId !== ownerId) throw new AppError(404, 'Regla no encontrada');

  return prisma.recurringRule.update({
    where: { id: ruleId },
    data: {
      amount: input.amount,
      dayOfMonth: input.dayOfMonth,
      autoPost: input.autoPost,
      active: input.active,
      endDate: input.endDate ?? rule.endDate,
    },
  });
}

export async function deleteRule(ownerId: string, ruleId: string) {
  const rule = await prisma.recurringRule.findUnique({ where: { id: ruleId } });
  if (!rule || rule.ownerId !== ownerId) throw new AppError(404, 'Regla no encontrada');
  await prisma.recurringRule.delete({ where: { id: ruleId } });
}

// F2: confirm atómico con FOR UPDATE — evita duplicados por requests concurrentes
// ponytail: inline balance mutation en lugar de llamar createTransaction — no soporta $transaction anidado
async function confirmRuleAtomically(
  ruleId: string,
  ownerId: string,
  userId: string,
  ownerContext: OwnerContext,
): Promise<{ alreadyConfirmed: boolean }> {
  return prisma.$transaction(async (tx) => {
    await (tx as any).$queryRaw`SELECT id FROM RecurringRule WHERE id = ${ruleId} FOR UPDATE`;

    const rule = await tx.recurringRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.ownerId !== ownerId) throw new AppError(404, 'Regla no encontrada');

    const now = new Date();
    if (rule.nextRunDate > now) return { alreadyConfirmed: true };
    if (!rule.active) throw new AppError(409, 'La regla está pausada');

    // Cuando la regla dispara una cuota de deuda, delegar al flujo payDebt (maneja lock, balance, TX y Debt update)
    if (rule.debtId) {
      await payDebtInTx(tx, rule.debtId, rule.walletId, Number(rule.amount), ownerContext, userId, rule.description ?? undefined);
      await tx.recurringRule.update({ where: { id: ruleId }, data: { nextRunDate: calcNextRunDate(rule.nextRunDate, rule.dayOfMonth) } });
      return { alreadyConfirmed: false };
    }

    // F9: lock wallets ANTES de leer currentBalance — orden determinístico por id para evitar deadlocks
    if (rule.movementType === 'TRANSFER') {
      if (!rule.destinationWalletId) throw new AppError(500, 'Transferencia sin wallet destino');
      const [first, second] = [rule.walletId, rule.destinationWalletId].sort();
      await (tx as any).$queryRaw`SELECT id FROM Wallet WHERE id = ${first} FOR UPDATE`;
      await (tx as any).$queryRaw`SELECT id FROM Wallet WHERE id = ${second} FOR UPDATE`;
    } else {
      await (tx as any).$queryRaw`SELECT id FROM Wallet WHERE id = ${rule.walletId} FOR UPDATE`;
    }

    // Leer balances DESPUÉS del lock
    const wallet = await tx.wallet.findUnique({ where: { id: rule.walletId } });
    if (!wallet || wallet.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Billetera no encontrada');

    let newBalance = Number(wallet.currentBalance);
    if (rule.movementType === 'INCOME') {
      newBalance += Number(rule.amount);
    } else if (rule.movementType === 'EXPENSE') {
      newBalance -= Number(rule.amount);
    } else if (rule.movementType === 'TRANSFER') {
      const dest = await tx.wallet.findUnique({ where: { id: rule.destinationWalletId! } });
      if (!dest) throw new AppError(404, 'Billetera destino no encontrada');
      await tx.wallet.update({ where: { id: rule.destinationWalletId! }, data: { currentBalance: Number(dest.currentBalance) + Number(rule.amount) } });
      newBalance -= Number(rule.amount);
    }

    await tx.wallet.update({ where: { id: rule.walletId }, data: { currentBalance: newBalance } });

    const transaction = await tx.transaction.create({
      data: {
        walletId: rule.walletId,
        destinationWalletId: rule.destinationWalletId,
        categoryId: rule.categoryId,
        amount: rule.amount,
        description: rule.description,
        date: now,
        movementType: rule.movementType,
      },
    });

    await tx.transactionHistory.create({
      data: { transactionId: transaction.id, modifiedById: userId, action: 'CREATE', newSnapshot: transaction as any },
    });

    await tx.recurringRule.update({
      where: { id: ruleId },
      data: { nextRunDate: calcNextRunDate(rule.nextRunDate, rule.dayOfMonth) },
    });

    return { alreadyConfirmed: false };
  });
}

// F3: materializar autoPost=true lazily; retornar solo las manuales (autoPost=false) para la UI
export async function getPendingRules(ownerId: string, userId: string, ownerContext: OwnerContext) {
  const now = new Date();

  const autoPostDue = await prisma.recurringRule.findMany({
    where: { ownerId, active: true, autoPost: true, nextRunDate: { lte: now } },
  });

  // fire-and-forget individual — fallos no bloquean la respuesta
  await Promise.allSettled(
    autoPostDue.map((r) => confirmRuleAtomically(r.id, ownerId, userId, ownerContext)),
  );

  return prisma.recurringRule.findMany({
    where: { ownerId, active: true, autoPost: false, nextRunDate: { lte: now } },
    orderBy: { nextRunDate: 'asc' },
  });
}

export async function confirmRule(
  ownerId: string,
  ruleId: string,
  userId: string,
  ownerContext: OwnerContext,
) {
  return confirmRuleAtomically(ruleId, ownerId, userId, ownerContext);
}
