import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { AppError } from '../../core/errors';

// Mock prisma y redis
vi.mock('../../core/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    userDelegation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../core/database/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../core/security/jwt', () => ({
  signToken: vi.fn(),
  verifyToken: vi.fn(),
  tokenTtlSeconds: vi.fn(),
}));

// Mock auth.ratelimit como passthrough
vi.mock('../auth/auth.ratelimit', () => ({
  authRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

import { prisma } from '../../core/database/prisma';
import { verifyToken } from '../../core/security/jwt';

const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockFindFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;
const mockFindManyDelegation = prisma.userDelegation.findMany as ReturnType<typeof vi.fn>;
const mockFindUniqueDelegation = prisma.userDelegation.findUnique as ReturnType<typeof vi.fn>;
const mockCreateDelegation = prisma.userDelegation.create as ReturnType<typeof vi.fn>;
const mockUpdateDelegation = prisma.userDelegation.update as ReturnType<typeof vi.fn>;
const mockVerifyToken = verifyToken as ReturnType<typeof vi.fn>;

const fakeUserId = 'user-1';
const fakeJti = 'jti-1';
const fakeToken = 'fake.token.here';

const fakeUser = {
  id: fakeUserId,
  email: 'test@example.com',
  name: 'Test User',
};

const fakeTargetUser = {
  id: 'user-2',
  email: 'target@example.com',
  name: 'Target User',
};

const fakeDelegation = {
  id: 'delegation-1',
  ownerId: fakeUserId,
  delegatedUserId: fakeTargetUser.id,
  role: 'SUPERVISOR',
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Setup default verifyToken mock para todos los tests
  mockVerifyToken.mockReturnValue({
    sub: fakeUserId,
    email: fakeUser.email,
    jti: fakeJti,
  });
});

describe('GET /api/delegations', () => {
  it('retorna 401 sin autenticación', async () => {
    const res = await request(app).get('/api/delegations');
    expect(res.status).toBe(401);
  });

  it('retorna { granted, managing } arrays cuando autenticado', async () => {
    // Setup: usuario actual es dueño de algunas delegaciones y delegado en otras
    const grantedDelegation = {
      id: 'del-1',
      ownerId: fakeUserId,
      delegatedUserId: 'user-2',
      role: 'SUPERVISOR',
      active: true,
      owner: { id: fakeUserId, name: fakeUser.name, email: fakeUser.email },
      delegated: { id: 'user-2', name: 'Target', email: 'target@example.com' },
    };

    const managingDelegation = {
      id: 'del-2',
      ownerId: 'user-3',
      delegatedUserId: fakeUserId,
      role: 'ASESOR',
      active: true,
      owner: { id: 'user-3', name: 'Owner', email: 'owner@example.com' },
      delegated: { id: fakeUserId, name: fakeUser.name, email: fakeUser.email },
    };

    mockFindManyDelegation.mockResolvedValue([grantedDelegation, managingDelegation]);

    const res = await request(app)
      .get('/api/delegations')
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('granted');
    expect(res.body).toHaveProperty('managing');
    expect(Array.isArray(res.body.granted)).toBe(true);
    expect(Array.isArray(res.body.managing)).toBe(true);

    // Granted: el usuario es dueño, el usuario que recibe es delegated
    expect(res.body.granted[0]).toEqual({
      id: 'del-1',
      role: 'SUPERVISOR',
      user: { id: 'user-2', name: 'Target', email: 'target@example.com' },
    });

    // Managing: el usuario es delegado, el usuario que delega es owner
    expect(res.body.managing[0]).toEqual({
      id: 'del-2',
      role: 'ASESOR',
      user: { id: 'user-3', name: 'Owner', email: 'owner@example.com' },
    });
  });
});

describe('POST /api/delegations', () => {
  it('retorna 401 sin autenticación', async () => {
    const res = await request(app)
      .post('/api/delegations')
      .send({ email: 'target@example.com', role: 'SUPERVISOR' });
    expect(res.status).toBe(401);
  });

  it('retorna 404 cuando el email no existe', async () => {
    mockFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${fakeToken}`)
      .send({ email: 'noexiste@example.com', role: 'SUPERVISOR' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Usuario no encontrado');
  });

  it('retorna 400 cuando intenta auto-delegarse', async () => {
    mockFindFirst.mockResolvedValue(fakeUser);

    const res = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${fakeToken}`)
      .send({ email: fakeUser.email, role: 'SUPERVISOR' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No puedes delegarte a ti mismo');
  });

  it('retorna 409 cuando ya existe delegación activa', async () => {
    mockFindFirst.mockResolvedValue(fakeTargetUser);
    mockFindUniqueDelegation.mockResolvedValue(fakeDelegation);

    const res = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${fakeToken}`)
      .send({ email: fakeTargetUser.email, role: 'SUPERVISOR' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Delegación ya activa');
  });

  it('retorna 201 con delegación creada exitosamente', async () => {
    mockFindFirst.mockResolvedValue(fakeTargetUser);
    mockFindUniqueDelegation.mockResolvedValue(null);
    mockCreateDelegation.mockResolvedValue(fakeDelegation);

    const res = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${fakeToken}`)
      .send({ email: fakeTargetUser.email, role: 'SUPERVISOR' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'delegation-1',
      ownerId: fakeUserId,
      delegatedUserId: 'user-2',
      role: 'SUPERVISOR',
      active: true,
    });
  });

  it('reactiva delegación inactiva y actualiza el role (201)', async () => {
    const inactiveDelegation = { ...fakeDelegation, active: false, role: 'ASESOR' };
    mockFindFirst.mockResolvedValue(fakeTargetUser);
    mockFindUniqueDelegation.mockResolvedValue(inactiveDelegation);
    mockUpdateDelegation.mockResolvedValue({ ...inactiveDelegation, active: true, role: 'SUPERVISOR' });

    const res = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${fakeToken}`)
      .send({ email: fakeTargetUser.email, role: 'SUPERVISOR' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ active: true, role: 'SUPERVISOR' });
    expect(mockUpdateDelegation).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: true, role: 'SUPERVISOR' } }),
    );
  });

  it('valida que role sea uno de los valores permitidos', async () => {
    const res = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${fakeToken}`)
      .send({ email: 'target@example.com', role: 'INVALID' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/delegations/:id', () => {
  it('retorna 401 sin autenticación', async () => {
    const res = await request(app).delete('/api/delegations/delegation-1');
    expect(res.status).toBe(401);
  });

  it('retorna 404 cuando la delegación no existe', async () => {
    mockFindUniqueDelegation.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/delegations/noexiste')
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Delegación no encontrada');
  });

  it('retorna 403 cuando el usuario no es owner', async () => {
    const otherUsersDelegation = {
      ...fakeDelegation,
      ownerId: 'user-other',
    };

    mockFindUniqueDelegation.mockResolvedValue(otherUsersDelegation);

    const res = await request(app)
      .delete('/api/delegations/delegation-1')
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('No autorizado');
  });

  it('retorna 204 al revocar exitosamente', async () => {
    mockFindUniqueDelegation.mockResolvedValue(fakeDelegation);
    mockUpdateDelegation.mockResolvedValue({ ...fakeDelegation, active: false });

    const res = await request(app)
      .delete('/api/delegations/delegation-1')
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(res.status).toBe(204);
  });
});
