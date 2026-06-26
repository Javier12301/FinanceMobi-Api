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
