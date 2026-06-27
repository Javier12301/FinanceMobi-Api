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
  return prisma.wallet.update({
    where: { id: walletId },
    data: { name: input.name, typeId: input.typeId, description: input.description },
  });
}

export async function deleteWallet(walletId: string) {
  const count = await prisma.transaction.count({ where: { walletId } });
  if (count > 0) throw new AppError(409, 'No se puede eliminar una billetera con transacciones.');
  return prisma.wallet.delete({ where: { id: walletId } });
}
