import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Mocks antes de importar app — evitan conexiones reales a Redis y Prisma
vi.mock('./database/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock('./database/redis', () => ({
  redis: {
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn().mockResolvedValue(0),
    call: vi.fn().mockResolvedValue('OK'),
    connect: vi.fn(),
    on: vi.fn(),
  },
}));
// El rate limiter usa Redis internamente; en este test lo reemplazamos con passthrough
vi.mock('../features/auth/auth.ratelimit', () => ({
  authRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import request from 'supertest';
import { app } from '../app';
import { validate } from './middlewares/validate';
import { errorHandler } from './middlewares/errorHandler';
import { AppError } from './errors';

// ─── Health endpoint ──────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('devuelve HTTP 200 con { status: "ok" }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// ─── Validate middleware ──────────────────────────────────────────────────────

const schema = z.object({ email: z.string().email() });

function mockRes() {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe('validate middleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('llama next() cuando el body es válido', () => {
    const req = { body: { email: 'ok@example.com' } } as Request;
    const res = mockRes();
    const next = vi.fn();
    validate(schema)(req, res, next);
    expect(next).toHaveBeenCalledWith(); // sin argumentos = sin error
  });

  it('retorna HTTP 400 cuando el body es inválido', () => {
    const req = { body: { email: 'no-es-email' } } as Request;
    const res = mockRes();
    const next = vi.fn();
    validate(schema)(req, res, next);
    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('sanitiza el body con los datos parseados por Zod', () => {
    const req = { body: { email: 'ok@example.com', campo_extra: 'x' } } as Request;
    const res = mockRes();
    validate(schema)(req, res, vi.fn());
    expect(req.body).toEqual({ email: 'ok@example.com' }); // campo_extra eliminado
  });
});

// ─── Error handler ────────────────────────────────────────────────────────────

describe('errorHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devuelve el statusCode y mensaje de AppError', () => {
    const req = {} as Request;
    const res = mockRes();
    errorHandler(new AppError(422, 'dato inválido'), req, res, vi.fn() as NextFunction);
    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(422);
    expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ error: 'dato inválido' });
  });

  it('devuelve HTTP 500 para errores inesperados sin exponer el stack', () => {
    const req = {} as Request;
    const res = mockRes();
    errorHandler(new Error('fallo interno'), req, res, vi.fn() as NextFunction);
    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(500);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty('stack');
    expect(body.error).toBe('Internal server error');
  });
});
