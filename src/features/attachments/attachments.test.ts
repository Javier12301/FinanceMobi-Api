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
    },
    transactionAttachment: {
      create: vi.fn(),
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
const mockFindUniqueTransaction = prisma.transaction.findUnique as ReturnType<typeof vi.fn>;
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
  it('llama Drive API y guarda googleFileId retornado', async () => {
    mockFindUniqueTransaction.mockResolvedValue({
      ...fakeTransaction,
      wallet: fakeWallet,
    });
    mockFindUniqueUser.mockResolvedValue({
      ...fakeUser,
      driveFolderId: 'drive-folder-123',
      encryptedGoogleRefreshToken: 'encrypted:token',
    });
    mockCreateAttachment.mockResolvedValue({
      id: 'attachment-123',
      transactionId: 'tx-123',
      googleFileId: 'drive-file-123',
      mimeType: 'application/pdf',
      uploadedAt: new Date(),
    });
    mockGetDriveClient.mockReturnValue({
      files: {
        create: vi.fn().mockResolvedValue({ data: { id: 'drive-file-123' } }),
      },
    });

    await expect(
      uploadAttachment('tx-123', 'owner-123', {
        buffer: Buffer.from('file content'),
        mimetype: 'application/pdf',
        originalname: 'document.pdf',
      }),
    ).rejects.toMatchObject({ statusCode: 501 });
    expect(mockCreateAttachment).not.toHaveBeenCalled();
  });

  it('MIME type no aprobado retorna 501', async () => {
    mockFindUniqueTransaction.mockResolvedValue({
      ...fakeTransaction,
      wallet: fakeWallet,
    });

    await expect(
      uploadAttachment('tx-123', 'owner-123', {
        buffer: Buffer.from('file content'),
        mimetype: 'application/exe',
        originalname: 'virus.exe',
      }),
    ).rejects.toMatchObject({
      statusCode: 501,
    });
  });

  it('límite de tamaño no aprobado retorna 501', async () => {
    mockFindUniqueTransaction.mockResolvedValue({
      ...fakeTransaction,
      wallet: fakeWallet,
    });

    const largeBuffer = Buffer.alloc(100 * 1024 * 1024); // 100MB

    await expect(
      uploadAttachment('tx-123', 'owner-123', {
        buffer: largeBuffer,
        mimetype: 'application/pdf',
        originalname: 'large.pdf',
      }),
    ).rejects.toMatchObject({
      statusCode: 501,
    });
  });

  it('Drive failure no persiste attachment en DB', async () => {
    mockFindUniqueTransaction.mockResolvedValue({
      ...fakeTransaction,
      wallet: fakeWallet,
    });
    mockFindUniqueUser.mockResolvedValue({
      ...fakeUser,
      driveFolderId: 'drive-folder-123',
      encryptedGoogleRefreshToken: 'encrypted:token',
    });
    mockGetDriveClient.mockReturnValue({
      files: {
        create: vi.fn().mockRejectedValue(new Error('Drive API error')),
      },
    });

    await expect(
      uploadAttachment('tx-123', 'owner-123', {
        buffer: Buffer.from('file content'),
        mimetype: 'application/pdf',
        originalname: 'document.pdf',
      }),
    ).rejects.toThrow();

    expect(mockCreateAttachment).not.toHaveBeenCalled();
  });
});

describe('listAttachments', () => {
  it('solo retorna attachments del owner autorizado', async () => {
    mockFindUniqueTransaction.mockResolvedValue({
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
  it('retorna 501 — política no resuelta', async () => {
    await expect(deleteAttachment('attachment-123')).rejects.toMatchObject({
      statusCode: 501,
      message: expect.stringContaining('eliminación'),
    });
  });
});
