import { prisma } from '../../core/database/prisma';
import { AppError } from '../../core/errors';
import type { AdjustWalletBalanceInput, CreateWalletInput, UpdateWalletInput } from './wallets.schema';

export async function createWallet(ownerId: string, input: CreateWalletInput) {
  if (input.id) {
    const existing = await prisma.wallet.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.ownerId !== ownerId) throw new AppError(409, 'El identificador ya pertenece a otra billetera');
      return existing;
    }
  }
  return prisma.wallet.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      ownerId,
      typeId: input.typeId,
      name: input.name,
      description: input.description,
      initialBalance: input.initialBalance,
      currentBalance: input.initialBalance,
    },
  });
}

export async function listWallets(ownerId: string) {
  return prisma.wallet.findMany({ where: { ownerId } });
}

export async function updateWallet(walletId: string, input: UpdateWalletInput) {
  const data: any = { name: input.name, typeId: input.typeId, description: input.description };

  // Corregir saldo inicial: el saldo actual se mueve la misma diferencia para no perder
  // el efecto de los movimientos ya registrados (currentBalance = initial + movimientos).
  if (input.initialBalance !== undefined) {
    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new AppError(404, 'Billetera no encontrada');
    const delta = input.initialBalance - Number(wallet.initialBalance);
    data.initialBalance = input.initialBalance;
    data.currentBalance = Number(wallet.currentBalance) + delta;
  }

  return prisma.wallet.update({ where: { id: walletId }, data });
}

export async function deleteWallet(walletId: string) {
  const count = await prisma.transaction.count({ where: { walletId } });
  if (count > 0) throw new AppError(409, 'No se puede eliminar una billetera con transacciones.');
  return prisma.wallet.delete({ where: { id: walletId } });
}

export async function adjustWalletBalance(walletId: string, ownerId: string, userId: string, input: AdjustWalletBalanceInput) {
  return prisma.$transaction(async (tx) => {
    if (input.id) {
      const existing = await tx.transaction.findUnique({ where: { id: input.id } });
      if (existing) {
        if (existing.walletId !== walletId || existing.movementType !== 'ADJUSTMENT') {
          throw new AppError(409, 'El identificador ya pertenece a otro movimiento');
        }
        return existing;
      }
    }

    await (tx as any).$queryRaw`SELECT id FROM Wallet WHERE id = ${walletId} FOR UPDATE`;
    const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
    if (!wallet || wallet.ownerId !== ownerId) throw new AppError(404, 'Billetera no encontrada');

    const previousBalance = Number(wallet.currentBalance);
    const delta = input.targetBalance - previousBalance;
    const transaction = await tx.transaction.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        walletId,
        amount: delta,
        description: input.note || null,
        date: new Date(),
        movementType: 'ADJUSTMENT',
      },
    });
    await tx.wallet.update({ where: { id: walletId }, data: { currentBalance: input.targetBalance } });
    await tx.transactionHistory.create({
      data: {
        transactionId: transaction.id,
        modifiedById: userId,
        action: 'ADJUSTMENT',
        newSnapshot: { previousBalance, targetBalance: input.targetBalance, delta, note: input.note ?? null },
      },
    });
    return transaction;
  });
}
