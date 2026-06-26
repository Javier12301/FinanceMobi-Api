import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../database/redis', () => ({
  redis: { exists: vi.fn() },
}));
vi.mock('../security/jwt', () => ({
  verifyToken: vi.fn(),
}));

import { authMiddleware } from './auth';
import { redis } from '../database/redis';
import { verifyToken } from '../security/jwt';

const mockExists = redis.exists as ReturnType<typeof vi.fn>;
const mockVerify = verifyToken as ReturnType<typeof vi.fn>;

const validPayload = { sub: 'user-1', email: 'a@b.com', jti: 'jti-abc' };

function makeReq(authHeader?: string): Request {
  return { headers: { authorization: authHeader } } as unknown as Request;
}

beforeEach(() => vi.clearAllMocks());

describe('authMiddleware', () => {
  it('rechaza petición sin header Authorization', async () => {
    const next = vi.fn();
    await authMiddleware(makeReq(), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('rechaza header que no comienza con Bearer', async () => {
    const next = vi.fn();
    await authMiddleware(makeReq('Basic abc123'), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('rechaza JWT con firma inválida', async () => {
    mockVerify.mockImplementation(() => { throw new Error('invalid signature'); });
    const next = vi.fn();
    await authMiddleware(makeReq('Bearer token.invalido'), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('rechaza token con sesión revocada en Redis (exists = 0)', async () => {
    mockVerify.mockReturnValue(validPayload);
    mockExists.mockResolvedValue(0);
    const next = vi.fn();
    await authMiddleware(makeReq('Bearer token.valido'), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('llama next() sin error cuando JWT y sesión Redis son válidos', async () => {
    mockVerify.mockReturnValue(validPayload);
    mockExists.mockResolvedValue(1);
    const next = vi.fn() as NextFunction;
    const req = makeReq('Bearer token.valido');
    await authMiddleware(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith(); // sin argumentos = sin error
    expect(req.user).toEqual(validPayload);
  });

  it('consulta Redis con la clave session:{userId}:{jti}', async () => {
    mockVerify.mockReturnValue(validPayload);
    mockExists.mockResolvedValue(1);
    await authMiddleware(makeReq('Bearer token.valido'), {} as Response, vi.fn());
    expect(mockExists).toHaveBeenCalledWith('session:user-1:jti-abc');
  });
});
