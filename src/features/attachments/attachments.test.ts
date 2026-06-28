import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuthUrl, connectDrive, uploadAttachment, listAttachments, deleteAttachment } from './attachments.service';
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

vi.mock('../../core/database/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue('1'), // state válido por defecto
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../core/security/encryption', () => ({
  encrypt: vi.fn((text) => 'encrypted:' + text),
  decrypt: vi.fn((text) => text.replace('encrypted:', '')),
}));

vi.mock('../../core/security/driveClient', () => ({
  getDriveClient: vi.fn(),
}));

let mockGetTokenFn = vi.fn().mockResolvedValue({ tokens: { refresh_token: 'real-refresh-token' } });

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class MockOAuth2 {
        constructor(_id: string, _secret: string, _uri: string) {}
        getToken = mockGetTokenFn;
        generateAuthUrl = vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?...');
      },
    },
    drive: vi.fn().mockReturnValue({
      files: {
        list: vi.fn().mockResolvedValue({ data: { files: [] } }),
        create: vi.fn().mockResolvedValue({ data: { id: 'folder-123' } }),
      },
    }),
  },
}));

vi.mock('../../core/config/env', () => ({
  env: {
    ENCRYPTION_KEY: '0'.repeat(64),
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:5173/auth/drive/callback',
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

describe('getAuthUrl', () => {
  it('retorna url y state', async () => {
    const result = await getAuthUrl('user-123');
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('state');
    expect(typeof result.url).toBe('string');
    expect(typeof result.state).toBe('string');
    expect(result.state.length).toBeGreaterThan(0);
  });

  it('state es único en cada llamada', async () => {
    const result1 = await getAuthUrl('user-123');
    const result2 = await getAuthUrl('user-123');
    expect(result1.state).not.toBe(result2.state);
  });
});

describe('connectDrive', () => {
  it('intercambia code por tokens y cifra el refresh_token antes de persistir', async () => {
    mockFindUniqueUser.mockResolvedValue(fakeUser);
    mockGetDriveClient.mockReturnValue({
      files: {
        list: vi.fn().mockResolvedValue({ data: { files: [] } }),
        create: vi.fn().mockResolvedValue({ data: { id: 'folder-123' } }),
      },
    });
    mockUpdateUser.mockResolvedValue({
      ...fakeUser,
      encryptedGoogleRefreshToken: 'encrypted:real-refresh-token',
      driveFolderId: 'folder-123',
    });

    await connectDrive('user-123', 'auth-code-123', 'valid-state');

    const encryptCall = vi.mocked(encrypt).mock.calls[0];
    expect(encryptCall[0]).toBe('real-refresh-token');
    expect(mockUpdateUser).toHaveBeenCalled();
  });

  it('lanza 400 si el exchange no devuelve refresh_token', async () => {
    mockFindUniqueUser.mockResolvedValue(fakeUser);
    mockGetTokenFn.mockResolvedValueOnce({ tokens: {} });

    await expect(connectDrive('user-123', 'bad-code', 'valid-state')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('No se obtuvo refresh token'),
    });
  });

  it('lanza 400 si el state OAuth es inválido', async () => {
    const { redis } = await import('../../core/database/redis');
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(connectDrive('user-123', 'code', 'bad-state')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('State OAuth inválido'),
    });
  });

  it('el refresh_token plaintext no se persiste', async () => {
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

    await connectDrive('user-123', 'auth-code-456', 'valid-state');

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
