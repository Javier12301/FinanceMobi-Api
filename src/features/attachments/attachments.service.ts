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
  transactionId: string,
  ownerId: string,
  file: { buffer: Buffer; mimetype: string; originalname: string },
) {
  // Validar MIME type
  const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (!allowedMimes.includes(file.mimetype)) {
    throw new AppError(501, 'Los tipos de archivo permitidos aún no están definidos.');
  }

  // Validar tamaño (ponytail: 10MB para MVP, upgrade cuando sea necesario)
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.buffer.length > MAX_SIZE) {
    throw new AppError(501, 'El límite de tamaño de archivo aún no está definido.');
  }

  // Verificar ownership
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { wallet: true },
  });
  if (!tx) throw new AppError(404, 'Transacción no encontrada');
  if (tx.wallet.ownerId !== ownerId) throw new AppError(403, 'No autorizado');

  // Get Drive client
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
  });
  if (!user || !user.encryptedGoogleRefreshToken || !user.driveFolderId) {
    throw new AppError(400, 'Google Drive no configurado');
  }

  const driveClient = getDriveClient(user.encryptedGoogleRefreshToken);

  // Upload to Drive BEFORE saving to DB (if Drive fails, don't persist)
  const uploadRes = await driveClient.files.create({
    requestBody: {
      name: file.originalname,
      parents: [user.driveFolderId],
      appProperties: {
        transactionId,
        ownerId,
      },
    },
    media: {
      mimeType: file.mimetype,
      body: file.buffer,
    },
    fields: 'id',
  });

  const googleFileId = uploadRes.data.id!;

  // Now save to DB
  const attachment = await prisma.transactionAttachment.create({
    data: {
      transactionId,
      googleFileId,
      mimeType: file.mimetype,
    },
  });

  return attachment;
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
