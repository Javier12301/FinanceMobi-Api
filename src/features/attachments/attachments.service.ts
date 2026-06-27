import { prisma } from '../../core/database/prisma';
import { encrypt } from '../../core/security/encryption';
import { getDriveClient } from '../../core/security/driveClient';
import { AppError } from '../../core/errors';
import { env } from '../../core/config/env';
import { Readable } from 'stream';

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
  files: { buffer: Buffer; mimetype: string; originalname: string }[],
) {
  // 1. Verificar ownership de la transacción
  const tx = await prisma.transaction.findFirst({
    where: { id: transactionId, deletedAt: null },
    include: { wallet: true },
  });
  if (!tx) throw new AppError(404, 'Transacción no encontrada');
  if (tx.wallet.ownerId !== ownerId) throw new AppError(403, 'No autorizado');

  // 2. Verificar Drive conectado
  const user = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!user?.encryptedGoogleRefreshToken || !user?.driveFolderId) {
    throw new AppError(409, 'Google Drive no conectado');
  }

  const drive = getDriveClient(user.encryptedGoogleRefreshToken);

  // 3. Subir cada file a Drive; si alguno falla, borrar los ya subidos y no tocar DB
  const uploaded: { googleFileId: string; mimeType: string }[] = [];
  try {
    for (const file of files) {
      const res = await drive.files.create({
        requestBody: {
          name: file.originalname,
          parents: [user.driveFolderId],
          appProperties: { transactionId, ownerId, mimeType: file.mimetype },
        },
        media: { mimeType: file.mimetype, body: Readable.from(file.buffer) },
        fields: 'id',
      });
      uploaded.push({ googleFileId: res.data.id!, mimeType: file.mimetype });
    }
  } catch (err) {
    // ponytail: best-effort cleanup — si falla, la transacción queda inconsistente pero es raro
    await Promise.allSettled(
      uploaded.map(({ googleFileId }) => drive.files.delete({ fileId: googleFileId })),
    );
    throw err;
  }

  // 4. Persistir en DB solo si todos los uploads fueron exitosos — crear individualmente para retornar IDs
  return Promise.all(
    uploaded.map(({ googleFileId, mimeType }) =>
      prisma.transactionAttachment.create({ data: { transactionId, googleFileId, mimeType } }),
    ),
  );
}

export async function listAttachments(transactionId: string, ownerContext: { ownerId: string; role: string }) {
  // Verify ownership
  const tx = await prisma.transaction.findFirst({
    where: { id: transactionId, deletedAt: null },
    include: { wallet: true },
  });
  if (!tx) throw new AppError(404, 'Transacción no encontrada');
  if (tx.wallet.ownerId !== ownerContext.ownerId) throw new AppError(403, 'No autorizado');

  return prisma.transactionAttachment.findMany({
    where: { transactionId },
  });
}

export async function deleteAttachment(
  attachmentId: string,
  transactionId: string,
  ownerId: string,
) {
  // 1. Cargar attachment verificando que pertenece a la transacción
  const att = await prisma.transactionAttachment.findUnique({
    where: { id: attachmentId },
    include: { transaction: { include: { wallet: true } } },
  });
  if (!att) throw new AppError(404, 'Adjunto no encontrado');
  if (att.transactionId !== transactionId) throw new AppError(404, 'Adjunto no encontrado');
  if (att.transaction.deletedAt !== null) throw new AppError(404, 'Transacción no encontrada');
  if (att.transaction.wallet.ownerId !== ownerId) throw new AppError(403, 'No autorizado');

  // 2. Borrar Drive primero; si falla, no tocar DB
  const user = await prisma.user.findUnique({ where: { id: ownerId } });
  const drive = getDriveClient(user!.encryptedGoogleRefreshToken!);
  await drive.files.delete({ fileId: att.googleFileId });

  // 3. Borrar DB row
  await prisma.transactionAttachment.delete({ where: { id: attachmentId } });
}
