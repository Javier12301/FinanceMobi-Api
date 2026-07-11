import { prisma } from '../../core/database/prisma';
import { AppError } from '../../core/errors';
import { getDriveClient } from '../../core/security/driveClient';
import type { ResetAccountingInput } from './accounting.schema';

async function deleteRemoteAttachments(ownerId: string) {
  const [user, attachments] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { encryptedGoogleRefreshToken: true } }),
    prisma.transactionAttachment.findMany({
      where: { transaction: { wallet: { ownerId } } },
      select: { googleFileId: true },
    }),
  ]);
  if (!attachments.length) return;
  if (!user?.encryptedGoogleRefreshToken) {
    throw new AppError(409, 'Google Drive no conectado: no se pueden borrar los adjuntos del reinicio');
  }
  const drive = getDriveClient(user.encryptedGoogleRefreshToken);
  for (const attachment of attachments) {
    try {
      await drive.files.delete({ fileId: attachment.googleFileId });
    } catch (error: any) {
      if (error?.code !== 404 && error?.response?.status !== 404) throw error;
    }
  }
}

export async function resetAccounting(ownerId: string, requesterId: string, input: ResetAccountingInput) {
  if (ownerId !== requesterId) throw new AppError(403, 'Solo el titular puede reiniciar sus datos contables');
  await deleteRemoteAttachments(ownerId);

  return prisma.$transaction(async (tx) => {
    const wallets = await tx.wallet.findMany({ where: { ownerId }, select: { id: true } });
    const walletIds = wallets.map((wallet) => wallet.id);
    if (walletIds.length) {
      const transactions = await tx.transaction.findMany({ where: { walletId: { in: walletIds } }, select: { id: true } });
      const transactionIds = transactions.map((transaction) => transaction.id);
      if (transactionIds.length) {
        await tx.transactionHistory.deleteMany({ where: { transactionId: { in: transactionIds } } });
        await tx.transactionAttachment.deleteMany({ where: { transactionId: { in: transactionIds } } });
        await tx.transaction.deleteMany({ where: { id: { in: transactionIds } } });
      }
    }
    await tx.recurringRule.deleteMany({ where: { ownerId } });
    await tx.budget.deleteMany({ where: { ownerId } });
    await tx.debt.deleteMany({ where: { ownerId } });
    if (input.walletStrategy === 'DELETE') {
      await tx.wallet.deleteMany({ where: { ownerId } });
    } else {
      await tx.wallet.updateMany({ where: { ownerId }, data: { initialBalance: 0, currentBalance: 0 } });
    }
    return { walletStrategy: input.walletStrategy, walletsAffected: wallets.length };
  });
}
