import { prisma } from '../../core/database/prisma';
import { encrypt } from '../../core/security/encryption';
import { getDriveClient } from '../../core/security/driveClient';
import { AppError } from '../../core/errors';
import { env } from '../../core/config/env';

export async function connectDrive(userId: string, refreshToken: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'Usuario no encontrado');

  const encrypted = encrypt(refreshToken, env.ENCRYPTION_KEY);
  const driveClient = getDriveClient(encrypted);

  // Create root folder if not exists
  const foldersRes = await driveClient.files.list({
    q: "mimeType='application/vnd.google-apps.folder' and name='FinanceVier' and trashed=false",
    spaces: 'drive',
    pageSize: 1,
    fields: 'files(id)',
  });

  let folderId = foldersRes.data.files?.[0]?.id;

  if (!folderId) {
    const createRes = await driveClient.files.create({
      requestBody: {
        name: 'FinanceVier',
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });
    folderId = createRes.data.id!;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      encryptedGoogleRefreshToken: encrypted,
      driveFolderId: folderId,
    },
  });
}

export async function uploadAttachment(
  _transactionId: string,
  _ownerId: string,
  _file: { buffer: Buffer; mimetype: string; originalname: string },
) {
  // ponytail: política de MIME y tamaño no aprobada — bloquear hasta resolución
  throw new AppError(501, 'Los límites de tipo y tamaño de archivo no están aprobados. La funcionalidad de subida no está disponible aún.');
}

export async function listAttachments(transactionId: string, ownerContext: { ownerId: string; role: string }) {
  // Verify ownership
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { wallet: true },
  });
  if (!tx) throw new AppError(404, 'Transacción no encontrada');
  if (tx.wallet.ownerId !== ownerContext.ownerId) throw new AppError(403, 'No autorizado');

  return prisma.transactionAttachment.findMany({
    where: { transactionId },
  });
}

export async function deleteAttachment(_attachmentId: string) {
  throw new AppError(501, 'La política de eliminación de adjuntos no está resuelta.');
}
