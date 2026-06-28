import { prisma } from '../../core/database/prisma';
import { AppError } from '../../core/errors';
import { createTransactionInTx } from '../transactions/transactions.service';
import type { CreateDebtInput, UpdateDebtInput, PayDebtInput } from './debts.schema';

interface OwnerContext {
  ownerId: string;
  role: 'OWNER' | 'SUPERVISOR' | 'ASESOR';
}

function serializeDebt(debt: any) {
  return {
    ...debt,
    principal: debt.principal.toString(),
    remaining: debt.remaining.toString(),
  };
}

async function findOwnedDebt(id: string, ownerId: string) {
  const debt = await prisma.debt.findUnique({ where: { id } });
  if (!debt || debt.ownerId !== ownerId) throw new AppError(404, 'Deuda no encontrada');
  return debt;
}

export async function listDebts(ownerContext: OwnerContext) {
  const debts = await prisma.debt.findMany({ where: { ownerId: ownerContext.ownerId }, orderBy: { createdAt: 'desc' } });
  return debts.map(serializeDebt);
}

export async function createDebt(input: CreateDebtInput, ownerContext: OwnerContext) {
  if (input.categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!cat || cat.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Categoría no encontrada');
  }

  // Cuando hay cuotas + fecha de vencimiento + billetera, crear RecurringRule vinculada atómicamente
  if (input.installmentsTotal && input.dueDate && input.walletId) {
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { id: input.walletId! } });
      if (!wallet || wallet.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Billetera no encontrada');

      let ruleCategoryId = input.categoryId;
      if (!ruleCategoryId) {
        const cat = await tx.category.findFirst({ where: { ownerId: ownerContext.ownerId } });
        if (!cat) throw new AppError(409, 'No hay categorías disponibles');
        ruleCategoryId = cat.id;
      }

      const debt = await tx.debt.create({
        data: {
          ownerId: ownerContext.ownerId,
          direction: input.direction,
          counterparty: input.counterparty,
          categoryId: input.categoryId ?? null,
          principal: input.principal,
          remaining: input.principal,
          installmentsTotal: input.installmentsTotal,
          dueDate: new Date(input.dueDate!),
          notes: input.notes ?? null,
        },
      });

      const dueDate = new Date(input.dueDate!);
      const rule = await tx.recurringRule.create({
        data: {
          ownerId: ownerContext.ownerId,
          walletId: input.walletId!,
          categoryId: ruleCategoryId,
          movementType: input.direction === 'I_OWE' ? 'EXPENSE' : 'INCOME',
          amount: input.principal / input.installmentsTotal!,
          dayOfMonth: dueDate.getUTCDate(),
          autoPost: false,
          startDate: dueDate,
          nextRunDate: dueDate,
          debtId: debt.id,
        },
      });

      const updatedDebt = await tx.debt.update({
        where: { id: debt.id },
        data: { recurringRuleId: rule.id },
      });

      return serializeDebt(updatedDebt);
    });
  }

  const debt = await prisma.debt.create({
    data: {
      ownerId: ownerContext.ownerId,
      direction: input.direction,
      counterparty: input.counterparty,
      categoryId: input.categoryId ?? null,
      principal: input.principal,
      remaining: input.principal,
      installmentsTotal: input.installmentsTotal ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      notes: input.notes ?? null,
    },
  });
  return serializeDebt(debt);
}

export async function updateDebt(id: string, input: UpdateDebtInput, ownerContext: OwnerContext) {
  await findOwnedDebt(id, ownerContext.ownerId);
  const debt = await prisma.debt.update({
    where: { id },
    data: {
      ...(input.counterparty !== undefined && { counterparty: input.counterparty }),
      ...(input.remaining !== undefined && { remaining: input.remaining }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });
  return serializeDebt(debt);
}

export async function deleteDebt(id: string, ownerContext: OwnerContext) {
  await findOwnedDebt(id, ownerContext.ownerId);
  await prisma.debt.delete({ where: { id } });
}

// ponytail: helper extraído para composición desde recurring.service (evita $transaction anidado)
export async function payDebtInTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  debtId: string,
  walletId: string,
  amount: number,
  ownerContext: OwnerContext,
  userId: string,
  customDescription?: string,
) {
  const debt = await tx.debt.findUnique({ where: { id: debtId } });
  if (!debt || debt.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Deuda no encontrada');
  if (debt.status === 'PAID') throw new AppError(409, 'La deuda ya está saldada');
  if (amount > Number(debt.remaining)) throw new AppError(400, 'El monto supera el saldo pendiente de la deuda');

  let categoryId = debt.categoryId;
  if (!categoryId) {
    const cat = await tx.category.findFirst({ where: { ownerId: ownerContext.ownerId } });
    if (!cat) throw new AppError(409, 'No hay categorías disponibles para registrar el pago');
    categoryId = cat.id;
  }

  const movementType = debt.direction === 'I_OWE' ? 'EXPENSE' : 'INCOME';
  const description = customDescription
    ?? (debt.installmentsTotal
      ? `Cuota ${(debt.installmentsPaid ?? 0) + 1}/${debt.installmentsTotal} — ${debt.counterparty}`
      : `Pago — ${debt.counterparty}`);

  await createTransactionInTx(tx, { walletId, categoryId, amount, movementType, date: new Date().toISOString(), description, debtId }, ownerContext, userId);

  const newRemaining = Math.max(0, Number(debt.remaining) - amount);
  const newInstallmentsPaid = (debt.installmentsPaid ?? 0) + 1;
  const isPaid = newRemaining === 0;

  let newDueDate = debt.dueDate;
  if (!isPaid && debt.dueDate && debt.installmentsTotal) {
    const next = new Date(debt.dueDate);
    next.setUTCMonth(next.getUTCMonth() + 1);
    newDueDate = next;
  }

  return tx.debt.update({
    where: { id: debtId },
    data: { remaining: newRemaining, installmentsPaid: newInstallmentsPaid, dueDate: newDueDate, status: isPaid ? 'PAID' : 'ACTIVE' },
  });
}

export async function payDebt(
  debtId: string,
  input: PayDebtInput,
  ownerContext: OwnerContext,
  userId: string,
) {
  const result = await prisma.$transaction((tx) => payDebtInTx(tx, debtId, input.walletId, input.amount, ownerContext, userId));
  return serializeDebt(result);
}
