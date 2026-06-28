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

export async function payDebt(
  debtId: string,
  input: PayDebtInput,
  ownerContext: OwnerContext,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const debt = await tx.debt.findUnique({ where: { id: debtId } });
    if (!debt || debt.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Deuda no encontrada');
    if (debt.status === 'PAID') throw new AppError(409, 'La deuda ya está saldada');
    if (input.amount > Number(debt.remaining)) throw new AppError(400, 'El monto supera el saldo pendiente de la deuda');

    // Verificar ownership del wallet antes de mutar cualquier estado
    const wallet = await tx.wallet.findUnique({ where: { id: input.walletId } });
    if (!wallet || wallet.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Billetera no encontrada');

    // Necesita una categoría válida del owner para crear la transacción
    // Si la deuda tiene categoryId la usa; si no, usa la primera categoría disponible del owner
    let categoryId = debt.categoryId;
    if (!categoryId) {
      const cat = await tx.category.findFirst({ where: { ownerId: ownerContext.ownerId } });
      if (!cat) throw new AppError(409, 'No hay categorías disponibles para registrar el pago');
      categoryId = cat.id;
    }

    const movementType = debt.direction === 'I_OWE' ? 'EXPENSE' : 'INCOME';

    // Crear transacción en el mismo tx (sin anidar $transaction)
    await createTransactionInTx(
      tx,
      {
        walletId: input.walletId,
        categoryId,
        amount: input.amount,
        movementType,
        date: new Date().toISOString(),
        description: `Pago deuda: ${debt.counterparty}`,
      },
      ownerContext,
      userId,
    );

    // Actualizar estado de la deuda
    const newRemaining = Math.max(0, Number(debt.remaining) - input.amount);
    const newInstallmentsPaid = (debt.installmentsPaid ?? 0) + 1;
    const isPaid = newRemaining === 0;

    // Avanzar dueDate un mes si tiene cuotas y no está saldada
    let newDueDate = debt.dueDate;
    if (!isPaid && debt.dueDate && debt.installmentsTotal) {
      const next = new Date(debt.dueDate);
      next.setMonth(next.getMonth() + 1);
      newDueDate = next;
    }

    const updatedDebt = await tx.debt.update({
      where: { id: debtId },
      data: {
        remaining: newRemaining,
        installmentsPaid: newInstallmentsPaid,
        dueDate: newDueDate,
        status: isPaid ? 'PAID' : 'ACTIVE',
      },
    });

    return serializeDebt(updatedDebt);
  });
}
