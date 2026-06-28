import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loginWithCredentials, logout, registerWithCredentials, getProfile } from './auth.service';
import { AppError } from '../../core/errors';

// Mocks de módulos externos — la lógica de negocio se prueba aislada
vi.mock('../../core/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    category: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../core/database/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../core/security/password', () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
  // Hash de formato bcrypt válido para que el test de tiempo constante pueda inspeccionarlo
  DUMMY_HASH: '$2a$12$static.dummy.hash.for.testing.purposes.only.XXXXXXXXX',
}));

vi.mock('../../core/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-at-least-32-characters-long',
    JWT_EXPIRES_IN: '7d',
    ENCRYPTION_KEY: '0'.repeat(64),
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:5173/auth/drive/callback',
  },
}));

import { prisma } from '../../core/database/prisma';
import { verifyPassword, hashPassword } from '../../core/security/password';

const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockVerify = verifyPassword as ReturnType<typeof vi.fn>;

const fakeUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  passwordHash: '$2a$12$hashedvalue',
};

beforeEach(() => vi.clearAllMocks());

describe('loginWithCredentials', () => {
  it('retorna token cuando las credenciales son válidas', async () => {
    mockFindUnique.mockResolvedValue(fakeUser);
    mockVerify.mockResolvedValue(true);

    const result = await loginWithCredentials(fakeUser.email, 'correctpass');

    expect(result).toHaveProperty('token');
    expect(typeof result.token).toBe('string');
  });

  it('lanza AppError 401 cuando el usuario no existe', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockVerify.mockResolvedValue(false);

    await expect(loginWithCredentials('noexiste@x.com', 'pass')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('lanza AppError 401 cuando la contraseña es incorrecta', async () => {
    mockFindUnique.mockResolvedValue(fakeUser);
    mockVerify.mockResolvedValue(false);

    await expect(loginWithCredentials(fakeUser.email, 'wrongpass')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('llama verifyPassword con un hash bcrypt válido aunque el usuario no exista', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockVerify.mockResolvedValue(false);

    await loginWithCredentials('noexiste@x.com', 'cualquier').catch(() => null);

    const hashUsado = mockVerify.mock.calls[0][1] as string;
    // Un hash bcrypt real siempre comienza con $2a$ o $2b$ y tiene al menos 60 chars
    expect(hashUsado).toMatch(/^\$2[ab]\$\d{2}\$.{53}$/);
  });

  it('el mensaje de error es genérico (no revela cuál campo falló)', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockVerify.mockResolvedValue(false);

    const errA = await loginWithCredentials('noexiste@x.com', 'x').catch((e) => e);

    mockFindUnique.mockResolvedValue(fakeUser);
    mockVerify.mockResolvedValue(false);

    const errB = await loginWithCredentials(fakeUser.email, 'wrongpass').catch((e) => e);

    expect(errA.message).toBe(errB.message);
  });
});

describe('logout', () => {
  it('elimina solo la clave de sesión del jti dado', async () => {
    const { redis } = await import('../../core/database/redis');
    await logout('user-uuid-1', 'some-jti');
    expect(redis.del).toHaveBeenCalledWith('session:user-uuid-1:some-jti');
    expect(redis.del).toHaveBeenCalledTimes(1);
  });
});

describe('issueSession — clave Redis', () => {
  it('guarda session:{userId}:{jti} en Redis con TTL numérico', async () => {
    const { redis } = await import('../../core/database/redis');
    mockFindUnique.mockResolvedValue(fakeUser);
    mockVerify.mockResolvedValue(true);

    await loginWithCredentials(fakeUser.email, 'correctpass');

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^session:user-uuid-1:[0-9a-f-]{36}$/),
      '1',
      'EX',
      expect.any(Number),
    );
  });
});

describe('registerWithCredentials', () => {
  const mockFindFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;
  const mockHashPassword = hashPassword as ReturnType<typeof vi.fn>;
  const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

  const makeMockTx = (userId = 'new-user-id', email = 'new@test.com') => ({
    user: { create: vi.fn().mockResolvedValue({ id: userId, email, name: 'Test User', passwordHash: 'hashed' }) },
    category: { createMany: vi.fn().mockResolvedValue({ count: 8 }) },
    walletType: { findFirst: vi.fn().mockResolvedValue({ id: 1, name: 'CASH' }) },
    wallet: { create: vi.fn().mockResolvedValue({ id: 'wallet-id', name: 'Efectivo' }) },
  });

  it('retorna token cuando el registro es válido', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockHashPassword.mockResolvedValue('hashedpass');
    mockTransaction.mockImplementation(async (fn: Function) => fn(makeMockTx()));

    const result = await registerWithCredentials('Test User', 'new@test.com', 'password123');

    expect(result).toHaveProperty('token');
    expect(typeof result.token).toBe('string');
  });

  it('lanza AppError 409 cuando el email ya existe', async () => {
    mockFindFirst.mockResolvedValue({ id: 'existing-id', email: 'existing@test.com' });

    await expect(registerWithCredentials('Test', 'existing@test.com', 'pass')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('hashea la contraseña antes de crear el usuario', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockHashPassword.mockResolvedValue('hashedpass');
    mockTransaction.mockImplementation(async (fn: Function) => fn(makeMockTx('new-id', 'test@test.com')));

    await registerWithCredentials('Test', 'test@test.com', 'mypass123');

    expect(mockHashPassword).toHaveBeenCalledWith('mypass123');
  });

  it('crea la sesión en Redis después del registro', async () => {
    const { redis } = await import('../../core/database/redis');
    mockFindFirst.mockResolvedValue(null);
    mockHashPassword.mockResolvedValue('hashedpass');
    mockTransaction.mockImplementation(async (fn: Function) => fn(makeMockTx('new-id', 'new@test.com')));

    await registerWithCredentials('Test', 'new@test.com', 'pass');

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^session:new-id:[0-9a-f-]{36}$/),
      '1',
      'EX',
      expect.any(Number),
    );
  });

  it('crea wallet Efectivo durante el registro', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockHashPassword.mockResolvedValue('hashedpass');
    const tx = makeMockTx();
    mockTransaction.mockImplementation(async (fn: Function) => fn(tx));

    await registerWithCredentials('Test', 'new@test.com', 'pass');

    expect(tx.wallet.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Efectivo', initialBalance: 0, currentBalance: 0 }) }),
    );
  });

  it('crea exactamente 8 categorías V4 con icon y color', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockHashPassword.mockResolvedValue('hashedpass');
    const tx = makeMockTx();
    mockTransaction.mockImplementation(async (fn: Function) => fn(tx));

    await registerWithCredentials('Test', 'new@test.com', 'pass');

    const { data } = tx.category.createMany.mock.calls[0][0];
    expect(data).toHaveLength(8);
    expect(data.every((c: any) => c.icon && c.color)).toBe(true);
  });
});

describe('getProfile', () => {
  const mockFindUniqueProfile = prisma.user.findUnique as ReturnType<typeof vi.fn>;

  it('driveConnected = false cuando no hay token ni folderId', async () => {
    mockFindUniqueProfile.mockResolvedValue({
      id: 'user-id', name: 'John Doe', email: 'john@example.com',
      encryptedGoogleRefreshToken: null, driveFolderId: null,
    });
    const result = await getProfile('user-id');
    expect(result.driveConnected).toBe(false);
  });

  it('driveConnected = false cuando solo hay token (sin folderId)', async () => {
    mockFindUniqueProfile.mockResolvedValue({
      id: 'user-id', name: 'John Doe', email: 'john@example.com',
      encryptedGoogleRefreshToken: 'encrypted-token', driveFolderId: null,
    });
    const result = await getProfile('user-id');
    expect(result.driveConnected).toBe(false);
  });

  it('driveConnected = false cuando solo hay folderId (sin token)', async () => {
    mockFindUniqueProfile.mockResolvedValue({
      id: 'user-id', name: 'John Doe', email: 'john@example.com',
      encryptedGoogleRefreshToken: null, driveFolderId: 'folder-id',
    });
    const result = await getProfile('user-id');
    expect(result.driveConnected).toBe(false);
  });

  it('driveConnected = true cuando existen token y folderId', async () => {
    mockFindUniqueProfile.mockResolvedValue({
      id: 'user-id', name: 'Jane Doe', email: 'jane@example.com',
      encryptedGoogleRefreshToken: 'encrypted-token', driveFolderId: 'folder-id',
    });
    const result = await getProfile('user-id');
    expect(result.driveConnected).toBe(true);
  });

  it('lanza AppError 404 cuando el usuario no existe', async () => {
    mockFindUniqueProfile.mockResolvedValue(null);

    await expect(getProfile('nonexistent-id')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
