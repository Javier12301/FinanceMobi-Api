import { prisma } from '../../core/database/prisma';
import { AppError } from '../../core/errors';
import type { CreateWalletInput, UpdateWalletInput } from './wallets.schema';

export async function createWallet(ownerId: string, input: CreateWalletInput) {
  return prisma.wallet.create({
    data: {
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
