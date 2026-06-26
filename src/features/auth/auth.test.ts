import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loginWithCredentials, logout } from './auth.service';
import { AppError } from '../../core/errors';

// Mocks de módulos externos — la lógica de negocio se prueba aislada
vi.mock('../../core/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
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
  // Hash de formato bcrypt válido para que el test de tiempo constante pueda inspeccionarlo
  DUMMY_HASH: '$2a$12$static.dummy.hash.for.testing.purposes.only.XXXXXXXXX',
}));

import { prisma } from '../../core/database/prisma';
import { verifyPassword } from '../../core/security/password';

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
