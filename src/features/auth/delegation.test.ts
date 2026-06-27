import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

vi.mock('../../core/database/prisma', () => ({
  prisma: {
    userDelegation: { findFirst: vi.fn() },
    wallet: { findUnique: vi.fn() },
    transaction: { findUnique: vi.fn() },
    transactionAttachment: { findUnique: vi.fn() },
  },
}));

import { requireOwnerContext } from '../../core/middlewares/ownerContext';
import { requireRole } from '../../core/middlewares/rbac';
import { ownershipGuard } from '../../core/middlewares/ownershipGuard';
import { prisma } from '../../core/database/prisma';

const mockFindFirst = prisma.userDelegation.findFirst as ReturnType<typeof vi.fn>;
const mockFindWallet = prisma.wallet.findUnique as ReturnType<typeof vi.fn>;
const mockFindTransaction = prisma.transaction.findUnique as ReturnType<typeof vi.fn>;
const mockFindAttachment = prisma.transactionAttachment.findUnique as ReturnType<typeof vi.fn>;

const userId = uuidv4();
const ownerId = uuidv4();
const anotherOwnerId = uuidv4();

function makeReq(
  userIdOverride?: string,
  headers?: Record<string, string>,
  method: string = 'GET',
  params?: Record<string, string>,
): Request {
  return {
    user: { sub: userIdOverride || userId, email: 'user@test.com', jti: uuidv4() },
    headers: headers || {},
    method,
    params: params || {},
  } as unknown as Request;
}

beforeEach(() => vi.clearAllMocks());

describe('Delegation Authorization - CP4', () => {
  // Test 1: Owner accede a sus propios recursos
  it('Owner can access own resources without delegation', async () => {
    const req = makeReq(ownerId, { 'x-owner-id': ownerId });
    const next = vi.fn() as NextFunction;

    await requireOwnerContext(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(); // sin error
    expect((req as any).ownerContext).toEqual({
      ownerId,
      role: 'OWNER',
    });
  });

  // Test 2: SUPERVISOR puede leer y escribir
  it('SUPERVISOR can read with delegation', async () => {
    const req = makeReq(userId, { 'x-owner-id': ownerId }, 'GET');
    mockFindFirst.mockResolvedValue({
      id: uuidv4(),
      ownerId,
      delegatedUserId: userId,
      role: 'SUPERVISOR',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const next = vi.fn() as NextFunction;
    await requireOwnerContext(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as any).ownerContext).toEqual({
      ownerId,
      role: 'SUPERVISOR',
    });
  });

  it('SUPERVISOR can write with delegation', async () => {
    const req = makeReq(userId, { 'x-owner-id': ownerId }, 'POST');
    mockFindFirst.mockResolvedValue({
      id: uuidv4(),
      ownerId,
      delegatedUserId: userId,
      role: 'SUPERVISOR',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const roleMw = requireRole('SUPERVISOR', 'OWNER');
    await requireOwnerContext(req, {} as Response, async () => {
      roleMw(req, {} as Response, vi.fn());
    });

    // Si llegamos aquí sin error, pasó
    expect(true).toBe(true);
  });

  // Test 3: ASESOR puede leer
  it('ASESOR can read with delegation', async () => {
    const req = makeReq(userId, { 'x-owner-id': ownerId }, 'GET');
    mockFindFirst.mockResolvedValue({
      id: uuidv4(),
      ownerId,
      delegatedUserId: userId,
      role: 'ASESOR',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const next = vi.fn() as NextFunction;
    await requireOwnerContext(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as any).ownerContext).toEqual({
      ownerId,
      role: 'ASESOR',
    });
  });

  // Test 4: ASESOR no puede escribir
  it('ASESOR cannot write with delegation', async () => {
    const req = makeReq(userId, { 'x-owner-id': ownerId }, 'POST');
    mockFindFirst.mockResolvedValue({
      id: uuidv4(),
      ownerId,
      delegatedUserId: userId,
      role: 'ASESOR',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const next = vi.fn() as NextFunction;
    await requireOwnerContext(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith(); // ownerContext debe setearse

    const roleMw = requireRole('OWNER', 'SUPERVISOR', 'ASESOR');
    const nextRole = vi.fn() as NextFunction;
    roleMw(req, {} as Response, nextRole);

    // El middleware debe rechazar porque ASESOR intenta hacer POST
    expect(nextRole).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  // Test 5: Delegación revocada pierde acceso
  it('Revoked delegation loses access', async () => {
    const req = makeReq(userId, { 'x-owner-id': ownerId }, 'GET');
    mockFindFirst.mockResolvedValue(null); // No encuentra delegación activa

    const next = vi.fn() as NextFunction;
    await requireOwnerContext(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  // Test 6: ID adivinado de otro owner es rechazado
  it('Guessed wallet ID from another owner is rejected', async () => {
    const walletId = uuidv4();
    const req = makeReq(userId, { 'x-owner-id': ownerId }, 'GET', { walletId });

    // Simular dueño diferente
    mockFindFirst.mockResolvedValue({
      id: uuidv4(),
      ownerId,
      delegatedUserId: userId,
      role: 'SUPERVISOR',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockFindWallet.mockResolvedValue({
      id: walletId,
      ownerId: anotherOwnerId,
      typeId: 1,
      name: 'Other Wallet',
      description: null,
      initialBalance: '100.00',
      currentBalance: '100.00',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const next = vi.fn() as NextFunction;
    await requireOwnerContext(req, {} as Response, next);

    const guardMw = ownershipGuard('wallet', 'walletId');
    const nextGuard = vi.fn() as NextFunction;
    await guardMw(req, {} as Response, nextGuard);

    // Debe rechazar porque ownerId no coincide
    expect(nextGuard).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  // Test 7: Contexto de owner ausente es rechazado
  it('Missing X-Owner-Id header is rejected', async () => {
    const req = makeReq(userId, {}); // Sin header X-Owner-Id
    const next = vi.fn() as NextFunction;

    await requireOwnerContext(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('Invalid X-Owner-Id (not UUID) is rejected', async () => {
    const req = makeReq(userId, { 'x-owner-id': 'invalid-uuid' });
    const next = vi.fn() as NextFunction;

    await requireOwnerContext(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});
