import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/database/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock('../../core/database/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
  },
}));
// Mockeamos el helper de verificación, no google-auth-library directo
vi.mock('../../core/security/googleAuth', () => ({
  verifyGoogleIdToken: vi.fn(),
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

import { loginWithGoogle } from './auth.service';
import { prisma } from '../../core/database/prisma';
import { verifyGoogleIdToken } from '../../core/security/googleAuth';
import { AppError } from '../../core/errors';

const mockFindFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;
const mockCreate = prisma.user.create as ReturnType<typeof vi.fn>;
const mockVerifyGoogle = verifyGoogleIdToken as ReturnType<typeof vi.fn>;

const googlePayload = { sub: 'google-sub-123', email: 'user@gmail.com' };
const existingUser = { id: 'user-uuid-1', email: 'user@gmail.com', googleId: 'google-sub-123' };

beforeEach(() => vi.clearAllMocks());

describe('loginWithGoogle', () => {
  it('identifica un usuario existente y emite JWT sin crear usuario nuevo', async () => {
    mockVerifyGoogle.mockResolvedValue(googlePayload);
    mockFindFirst.mockResolvedValue(existingUser);

    const result = await loginWithGoogle('valid-id-token');

    expect(result).toHaveProperty('token');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('crea usuario nuevo cuando no existe y emite JWT', async () => {
    mockVerifyGoogle.mockResolvedValue(googlePayload);
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ ...existingUser, id: 'user-uuid-new' });

    const result = await loginWithGoogle('valid-id-token');

    expect(result).toHaveProperty('token');
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('rechaza un id_token inválido', async () => {
    // verifyGoogleIdToken real lanza AppError(401) — el mock replica ese contrato
    mockVerifyGoogle.mockRejectedValue(new AppError(401, 'Token de Google inválido'));

    await expect(loginWithGoogle('bad-token')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('el id_token no se persiste en base de datos', async () => {
    mockVerifyGoogle.mockResolvedValue(googlePayload);
    mockFindFirst.mockResolvedValue(existingUser);

    await loginWithGoogle('valid-id-token');

    // Ninguna llamada a Prisma debe incluir el id_token como valor
    const allCalls = [...mockFindFirst.mock.calls, ...mockCreate.mock.calls].flat();
    expect(JSON.stringify(allCalls)).not.toContain('valid-id-token');
  });

  it('rechaza id_token cuyo email no está verificado por Google', async () => {
    mockVerifyGoogle.mockRejectedValue(new AppError(401, 'Token de Google inválido'));

    await expect(loginWithGoogle('token-email-sin-verificar')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('el usuario nuevo se crea con googleId del payload, no con el id_token', async () => {
    mockVerifyGoogle.mockResolvedValue(googlePayload);
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ ...existingUser, id: 'user-uuid-new' });

    await loginWithGoogle('valid-id-token');

    const createArg = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArg.data.googleId).toBe('google-sub-123');
    expect(JSON.stringify(createArg)).not.toContain('valid-id-token');
  });
});
