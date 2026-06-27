import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectDrive, uploadAttachment, listAttachments, deleteAttachment } from './attachments.service';
import { AppError } from '../../core/errors';

vi.mock('../../core/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    transactionAttachment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../core/security/encryption', () => ({
  encrypt: vi.fn((text) => 'encrypted:' + text),
  decrypt: vi.fn((text) => text.replace('encrypted:', '')),
}));

vi.mock('../../core/security/driveClient', () => ({
  getDriveClient: vi.fn(),
}));

vi.mock('../../core/config/env', () => ({
  env: {
    ENCRYPTION_KEY: '0'.repeat(64),
  },
}));

import { prisma } from '../../core/database/prisma';
import { encrypt } from '../../core/security/encryption';
import { getDriveClient } from '../../core/security/driveClient';

const mockFindUniqueUser = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockUpdateUser = prisma.user.update as ReturnType<typeof vi.fn>;
const mockFindFirstTransaction = prisma.transaction.findFirst as ReturnType<typeof vi.fn>;
const mockCreateAttachment = prisma.transactionAttachment.create as ReturnType<typeof vi.fn>;
const mockListAttachments = prisma.transactionAttachment.findMany as ReturnType<typeof vi.fn>;
const mockGetDriveClient = getDriveClient as ReturnType<typeof vi.fn>;

const fakeUser = {
  id: 'user-123',
  email: 'user@example.com',
  encryptedGoogleRefreshToken: null,
  driveFolderId: null,
};

const fakeWallet = {
  id: 'wallet-123',
  ownerId: 'owner-123',
  currentBalance: 1000,
};

const fakeTransaction = {
  id: 'tx-123',
  walletId: 'wallet-123',
  amount: 100,
};

beforeEach(() => vi.clearAllMocks());

describe('connectDrive', () => {
  it('cifra el refreshToken antes de persistir', async () => {
    mockFindUniqueUser.mockResolvedValue(fakeUser);
    mockGetDriveClient.mockReturnValue({
      files: {
        list: vi.fn().mockResolvedValue({ data: { files: [] } }),
        create: vi.fn().mockResolvedValue({ data: { id: 'folder-123' } }),
      },
    });
    mockUpdateUser.mockResolvedValue({
      ...fakeUser,
      encryptedGoogleRefreshToken: 'encrypted:refresh-token-123',
      driveFolderId: 'folder-123',
    });

    await connectDrive('user-123', 'refresh-token-123');

    const encryptCall = vi.mocked(encrypt).mock.calls[0];
    expect(encryptCall[0]).toBe('refresh-token-123');
    expect(mockUpdateUser).toHaveBeenCalled();
  });

  it('el refreshToken plaintext no se persiste', async () => {
    mockFindUniqueUser.mockResolvedValue(fakeUser);
    mockGetDriveClient.mockReturnValue({
      files: {
        list: vi.fn().mockResolvedValue({ data: { files: [] } }),
        create: vi.fn().mockResolvedValue({ data: { id: 'folder-123' } }),
      },
    });
    mockUpdateUser.mockResolvedValue({
      ...fakeUser,
      encryptedGoogleRefreshToken: 'encrypted:my-secret-token',
    });

    await connectDrive('user-123', 'my-secret-token');

    const updateCall = mockUpdateUser.mock.calls[0];
    const persistedData = updateCall[0].data;
    expect(persistedData.encryptedGoogleRefreshToken).not.toBe('my-secret-token');
    expect(persistedData.encryptedGoogleRefreshToken).toContain('encrypted:');
  });
});

describe('uploadAttachment', () => {
  it('verifica ownership de la transacción', async () => {
    mockFindFirstTransaction.mockResolvedValue({
      ...fakeTransaction,
      wallet: { ...fakeWallet, ownerId: 'different-owner' },
    });

    await expect(
      uploadAttachment('tx-123', 'owner-123', [
        {
          buffer: Buffer.from('file content'),
          mimetype: 'application/pdf',
          originalname: 'document.pdf',
        },
      ]),
    ).rejects.toMatchObject({ statusCode: 403, message: 'No autorizado' });
  });

  it('retorna 404 si transacción no existe', async () => {
    mockFindFirstTransaction.mockResolvedValue(null);

    await expect(
      uploadAttachment('tx-999', 'owner-123', [
        {
          buffer: Buffer.from('file content'),
          mimetype: 'application/pdf',
          originalname: 'document.pdf',
        },
      ]),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Transacción no encontrada' });
  });

  it('retorna 409 si Drive no está conectado', async () => {
    mockFindFirstTransaction.mockResolvedValue({
      ...fakeTransaction,
      wallet: fakeWallet,
    });
    mockFindUniqueUser.mockResolvedValue({
      ...fakeUser,
      encryptedGoogleRefreshToken: null,
      driveFolderId: null,
    });

    await expect(
      uploadAttachment('tx-123', 'owner-123', [
        {
          buffer: Buffer.from('file content'),
          mimetype: 'application/pdf',
          originalname: 'document.pdf',
        },
      ]),
    ).rejects.toMatchObject({ statusCode: 409, message: 'Google Drive no conectado' });
  });

  it('sube archivos a Drive y persiste en DB retornando array con IDs', async () => {
    mockFindFirstTransaction.mockResolvedValue({ ...fakeTransaction, wallet: fakeWallet });
    mockFindUniqueUser.mockResolvedValue({ ...fakeUser, driveFolderId: 'drive-folder-123', encryptedGoogleRefreshToken: 'encrypted:token' });
    const fakeRow = { id: 'att-1', transactionId: 'tx-123', googleFileId: 'drive-file-123', mimeType: 'application/pdf', uploadedAt: new Date() };
    const mockCreate = vi.fn().mockResolvedValue(fakeRow);
    (prisma.transactionAttachment as any).create = mockCreate;
    mockGetDriveClient.mockReturnValue({ files: { create: vi.fn().mockResolvedValue({ data: { id: 'drive-file-123' } }) } });

    const result = await uploadAttachment('tx-123', 'owner-123', [{ buffer: Buffer.from('content'), mimetype: 'application/pdf', originalname: 'doc.pdf' }]);

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ googleFileId: 'drive-file-123' }) }));
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty('id');
  });

  it('Drive failure no persiste attachment en DB', async () => {
    mockFindFirstTransaction.mockResolvedValue({ ...fakeTransaction, wallet: fakeWallet });
    mockFindUniqueUser.mockResolvedValue({ ...fakeUser, driveFolderId: 'drive-folder-123', encryptedGoogleRefreshToken: 'encrypted:token' });
    const mockCreate = vi.fn();
    (prisma.transactionAttachment as any).create = mockCreate;
    mockGetDriveClient.mockReturnValue({ files: { create: vi.fn().mockRejectedValue(new Error('Drive API error')), delete: vi.fn() } });

    await expect(uploadAttachment('tx-123', 'owner-123', [{ buffer: Buffer.from('content'), mimetype: 'application/pdf', originalname: 'doc.pdf' }])).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('sube múltiples archivos y retorna array de 2 elementos', async () => {
    mockFindFirstTransaction.mockResolvedValue({ ...fakeTransaction, wallet: fakeWallet });
    mockFindUniqueUser.mockResolvedValue({ ...fakeUser, driveFolderId: 'drive-folder-123', encryptedGoogleRefreshToken: 'encrypted:token' });
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({ id: 'att-1', googleFileId: 'file-1', mimeType: 'image/png', transactionId: 'tx-123', uploadedAt: new Date() })
      .mockResolvedValueOnce({ id: 'att-2', googleFileId: 'file-2', mimeType: 'application/pdf', transactionId: 'tx-123', uploadedAt: new Date() });
    (prisma.transactionAttachment as any).create = mockCreate;
    mockGetDriveClient.mockReturnValue({ files: { create: vi.fn().mockResolvedValueOnce({ data: { id: 'file-1' } }).mockResolvedValueOnce({ data: { id: 'file-2' } }) } });

    const result = await uploadAttachment('tx-123', 'owner-123', [
      { buffer: Buffer.from('file1'), mimetype: 'image/png', originalname: 'image.png' },
      { buffer: Buffer.from('file2'), mimetype: 'application/pdf', originalname: 'doc.pdf' },
    ]);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });
});

describe('listAttachments', () => {
  it('solo retorna attachments del owner autorizado', async () => {
    mockFindFirstTransaction.mockResolvedValue({
      ...fakeTransaction,
      wallet: fakeWallet,
    });
    mockListAttachments.mockResolvedValue([
      {
        id: 'attachment-123',
        transactionId: 'tx-123',
        googleFileId: 'drive-file-123',
        mimeType: 'application/pdf',
        uploadedAt: new Date(),
      },
    ]);

    const result = await listAttachments('tx-123', { ownerId: 'owner-123', role: 'OWNER' });

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('googleFileId', 'drive-file-123');
  });
});

describe('deleteAttachment', () => {
  it('retorna 404 si attachment no existe', async () => {
    const mockFindUnique = vi.fn().mockResolvedValue(null);
    (prisma.transactionAttachment as any).findUnique = mockFindUnique;

    await expect(deleteAttachment('attachment-999', 'tx-123', 'owner-123')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Adjunto no encontrado',
    });
  });

  it('retorna 404 si attachment no pertenece a la transacción', async () => {
    const mockFindUnique = vi.fn().mockResolvedValue({
      id: 'attachment-123',
      transactionId: 'tx-999',
      googleFileId: 'file-123',
      mimeType: 'application/pdf',
    });
    (prisma.transactionAttachment as any).findUnique = mockFindUnique;

    await expect(deleteAttachment('attachment-123', 'tx-123', 'owner-123')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Adjunto no encontrado',
    });
  });

  it('retorna 403 si el owner no es autorizado', async () => {
    const mockFindUnique = vi.fn().mockResolvedValue({
      id: 'attachment-123',
      transactionId: 'tx-123',
      googleFileId: 'file-123',
      mimeType: 'application/pdf',
      transaction: {
        id: 'tx-123',
        deletedAt: null,
        wallet: { ...fakeWallet, ownerId: 'different-owner' },
      },
    });
    (prisma.transactionAttachment as any).findUnique = mockFindUnique;

    await expect(deleteAttachment('attachment-123', 'tx-123', 'owner-123')).rejects.toMatchObject({
      statusCode: 403,
      message: 'No autorizado',
    });
  });

  it('borra de Drive primero, luego de DB', async () => {
    const mockFindUnique = vi.fn().mockResolvedValue({
      id: 'attachment-123',
      transactionId: 'tx-123',
      googleFileId: 'file-123',
      mimeType: 'application/pdf',
      transaction: {
        id: 'tx-123',
        deletedAt: null,
        wallet: fakeWallet,
      },
    });
    mockFindUniqueUser.mockResolvedValue({
      ...fakeUser,
      encryptedGoogleRefreshToken: 'encrypted:token',
    });
    const mockDelete = vi.fn().mockResolvedValue({});
    mockGetDriveClient.mockReturnValue({
      files: {
        delete: mockDelete,
      },
    });
    const mockDbDelete = vi.fn().mockResolvedValue({});
    (prisma.transactionAttachment as any).findUnique = mockFindUnique;
    (prisma.transactionAttachment as any).delete = mockDbDelete;

    await deleteAttachment('attachment-123', 'tx-123', 'owner-123');

    expect(mockDelete).toHaveBeenCalledWith({ fileId: 'file-123' });
    expect(mockDbDelete).toHaveBeenCalledWith({ where: { id: 'attachment-123' } });
  });

  it('Drive failure no toca DB', async () => {
    const mockFindUnique = vi.fn().mockResolvedValue({
      id: 'attachment-123',
      transactionId: 'tx-123',
      googleFileId: 'file-123',
      mimeType: 'application/pdf',
      transaction: {
        id: 'tx-123',
        deletedAt: null,
        wallet: fakeWallet,
      },
    });
    mockFindUniqueUser.mockResolvedValue({
      ...fakeUser,
      encryptedGoogleRefreshToken: 'encrypted:token',
    });
    mockGetDriveClient.mockReturnValue({
      files: {
        delete: vi.fn().mockRejectedValue(new Error('Drive error')),
      },
    });
    const mockDbDelete = vi.fn();
    (prisma.transactionAttachment as any).findUnique = mockFindUnique;
    (prisma.transactionAttachment as any).delete = mockDbDelete;

    await expect(deleteAttachment('attachment-123', 'tx-123', 'owner-123')).rejects.toThrow(
      'Drive error',
    );

    expect(mockDbDelete).not.toHaveBeenCalled();
  });
});
