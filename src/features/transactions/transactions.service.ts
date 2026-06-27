import { prisma } from '../../core/database/prisma';
import { AppError } from '../../core/errors';
import type { CreateTransactionInput, UpdateTransactionInput, ListTransactionFiltersInput } from './transactions.schema';

interface OwnerContext {
  ownerId: string;
  role: 'OWNER' | 'SUPERVISOR' | 'ASESOR';
}

export async function createTransaction(input: CreateTransactionInput, ownerContext: OwnerContext, userId: string) {
  if (input.amount <= 0) {
    throw new AppError(400, 'El monto debe ser positivo');
  }

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { id: input.walletId } });
    if (!wallet || wallet.ownerId !== ownerContext.ownerId) {
      throw new AppError(404, 'Billetera no encontrada');
    }

    const category = await tx.category.findUnique({ where: { id: input.categoryId } });
    if (!category || category.ownerId !== ownerContext.ownerId) {
      throw new AppError(404, 'Categoría no encontrada');
    }

    await (tx as any).$queryRaw`SELECT id FROM Wallet WHERE id = ${input.walletId} FOR UPDATE`;

    let newBalance = Number(wallet.currentBalance);
    if (input.movementType === 'INCOME') {
      newBalance += input.amount;
    } else if (input.movementType === 'EXPENSE') {
      newBalance -= input.amount;
    } else if (input.movementType === 'TRANSFER') {
      if (!input.destinationWalletId) {
        throw new AppError(400, 'destinationWalletId requerido para TRANSFER');
      }
      const destWallet = await tx.wallet.findUnique({ where: { id: input.destinationWalletId } });
      if (!destWallet || destWallet.ownerId !== ownerContext.ownerId) {
        throw new AppError(404, 'Billetera destino no encontrada');
      }
      await (tx as any).$queryRaw`SELECT id FROM Wallet WHERE id = ${input.destinationWalletId} FOR UPDATE`;

      const destNewBalance = Number(destWallet.currentBalance) + input.amount;
      await tx.wallet.update({
        where: { id: input.destinationWalletId },
        data: { currentBalance: destNewBalance },
      });

      newBalance -= input.amount;
    }

    await tx.wallet.update({
      where: { id: input.walletId },
      data: { currentBalance: newBalance },
    });

    const transaction = await tx.transaction.create({
      data: {
        walletId: input.walletId,
        destinationWalletId: input.destinationWalletId,
        categoryId: input.categoryId,
        amount: input.amount,
        description: input.description,
        date: new Date(input.date),
        movementType: input.movementType,
      },
    });

    await tx.transactionHistory.create({
      data: {
        transactionId: transaction.id,
        modifiedById: userId,
        action: 'CREATE',
        newSnapshot: transaction,
      },
    });

    return transaction;
  });
}

export async function listTransactions(ownerId: string, filters?: ListTransactionFiltersInput) {
  const wallets = await prisma.wallet.findMany({
    where: { ownerId },
    select: { id: true },
  });
  const walletIds = wallets.map((w) => w.id);

  const where: any = {
    walletId: { in: walletIds },
  };

  if (filters?.walletId) {
    where.walletId = filters.walletId;
  }
  if (filters?.categoryId) {
    where.categoryId = filters.categoryId;
  }
  if (filters?.dateFrom || filters?.dateTo) {
    where.date = {};
    if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.date.lte = new Date(filters.dateTo);
  }

  return prisma.transaction.findMany({ where });
}

export async function updateTransaction(
  transactionId: string,
  input: UpdateTransactionInput,
  userId: string,
  ownerContext: OwnerContext,
) {
  return prisma.$transaction(async (tx) => {
    const oldTx = await tx.transaction.findUnique({ where: { id: transactionId } });
    if (!oldTx) {
      throw new AppError(404, 'Transacción no encontrada');
    }

    const wallet = await tx.wallet.findUnique({ where: { id: oldTx.walletId } });
    if (!wallet || wallet.ownerId !== ownerContext.ownerId) {
      throw new AppError(404, 'Billetera no encontrada');
    }

    await (prisma as any).$queryRaw`SELECT id FROM Wallet WHERE id = ${oldTx.walletId} FOR UPDATE`;

    // Revertir balance anterior
    let newBalance = Number(wallet.currentBalance);
    if (oldTx.movementType === 'INCOME') {
      newBalance -= Number(oldTx.amount);
    } else if (oldTx.movementType === 'EXPENSE') {
      newBalance += Number(oldTx.amount);
    } else if (oldTx.movementType === 'TRANSFER') {
      newBalance += Number(oldTx.amount);
    }

    // Aplicar nueva transacción
    const finalAmount = input.amount ?? Number(oldTx.amount);
    const finalMovement = oldTx.movementType;
    if (finalMovement === 'INCOME') {
      newBalance += finalAmount;
    } else if (finalMovement === 'EXPENSE') {
      newBalance -= finalAmount;
    } else if (finalMovement === 'TRANSFER') {
      newBalance -= finalAmount;
    }

    await tx.wallet.update({
      where: { id: oldTx.walletId },
      data: { currentBalance: newBalance },
    });

    const updatedTx = await tx.transaction.update({
      where: { id: transactionId },
      data: {
        categoryId: input.categoryId ?? oldTx.categoryId,
        amount: input.amount ?? oldTx.amount,
        description: input.description ?? oldTx.description,
        date: input.date ? new Date(input.date) : oldTx.date,
      },
    });

    await tx.transactionHistory.create({
      data: {
        transactionId: transactionId,
        modifiedById: userId,
        action: 'UPDATE',
        oldSnapshot: oldTx,
        newSnapshot: updatedTx,
      },
    });

    return updatedTx;
  });
}

export async function deleteTransaction(transactionId: string, ownerContext: OwnerContext) {
  throw new AppError(
    501,
    'La política de eliminación de transacciones no está resuelta. Contacta al administrador.',
  );
}
