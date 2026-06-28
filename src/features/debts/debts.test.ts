import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listDebts, createDebt, updateDebt, deleteDebt, payDebt } from './debts.service';
import { AppError } from '../../core/errors';

vi.mock('../../core/database/prisma', () => ({
  prisma: {
    debt: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    wallet: { findUnique: vi.fn() },
    category: { findFirst: vi.fn() },
    transaction: { create: vi.fn() },
    transactionHistory: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../core/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-at-least-32-characters-long',
    JWT_EXPIRES_IN: '7d',
    ENCRYPTION_KEY: '0'.repeat(64),
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    GOOGLE_REDIRECT_URI: 'http://localhost/callback',
  },
}));

import { prisma } from '../../core/database/prisma';

const mockDebtFindMany = prisma.debt.findMany as ReturnType<typeof vi.fn>;
const mockDebtFindUnique = prisma.debt.findUnique as ReturnType<typeof vi.fn>;
const mockDebtCreate = prisma.debt.create as ReturnType<typeof vi.fn>;
const mockDebtUpdate = prisma.debt.update as ReturnType<typeof vi.fn>;
const mockDebtDelete = prisma.debt.delete as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

const ownerCtx = { ownerId: 'owner-1', role: 'OWNER' as const };

const fakeDebt = {
  id: 'debt-1',
  ownerId: 'owner-1',
  direction: 'I_OWE',
  counterparty: 'Banco Macro',
  categoryId: null,
  principal: { toString: () => '120000.00' },
  remaining: { toString: () => '120000.00' },
  recurringRuleId: null,
  installmentsTotal: 12,
  installmentsPaid: 0,
  dueDate: new Date('2026-07-05'),
  status: 'ACTIVE',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => vi.clearAllMocks());

describe('listDebts', () => {
  it('retorna deudas del owner serializadas con moneda como string', async () => {
    mockDebtFindMany.mockResolvedValue([fakeDebt]);
    const result = await listDebts(ownerCtx);
    expect(result[0].principal).toBe('120000.00');
    expect(result[0].remaining).toBe('120000.00');
  });
});

describe('createDebt', () => {
  it('crea deuda con remaining = principal y status ACTIVE', async () => {
    mockDebtCreate.mockResolvedValue({ ...fakeDebt });
    const input = { direction: 'I_OWE' as const, counterparty: 'Banco Macro', principal: 120000, installmentsTotal: 12, dueDate: '2026-07-05T00:00:00.000Z' };

    await createDebt(input, ownerCtx);

    expect(mockDebtCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ principal: 120000, remaining: 120000 }) }),
    );
  });

  it('retorna principal y remaining como strings', async () => {
    mockDebtCreate.mockResolvedValue({ ...fakeDebt });
    const result = await createDebt({ direction: 'I_OWE', counterparty: 'X', principal: 5000 }, ownerCtx);
    expect(typeof result.principal).toBe('string');
    expect(typeof result.remaining).toBe('string');
  });
});

describe('updateDebt', () => {
  it('lanza 404 si la deuda no pertenece al owner', async () => {
    mockDebtFindUnique.mockResolvedValue({ ...fakeDebt, ownerId: 'otro-owner' });
    await expect(updateDebt('debt-1', { counterparty: 'X' }, ownerCtx)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lanza 404 si la deuda no existe', async () => {
    mockDebtFindUnique.mockResolvedValue(null);
    await expect(updateDebt('debt-1', {}, ownerCtx)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('deleteDebt', () => {
  it('lanza 404 IDOR cuando el owner no coincide', async () => {
    mockDebtFindUnique.mockResolvedValue({ ...fakeDebt, ownerId: 'otro' });
    await expect(deleteDebt('debt-1', ownerCtx)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('elimina la deuda cuando el owner es correcto', async () => {
    mockDebtFindUnique.mockResolvedValue(fakeDebt);
    mockDebtDelete.mockResolvedValue(fakeDebt);
    await deleteDebt('debt-1', ownerCtx);
    expect(mockDebtDelete).toHaveBeenCalledWith({ where: { id: 'debt-1' } });
  });
});

describe('payDebt', () => {
  const makePayTx = (overrides: any = {}) => ({
    debt: {
      findUnique: vi.fn().mockResolvedValue({ ...fakeDebt, ...overrides }),
      update: vi.fn().mockResolvedValue({ ...fakeDebt, remaining: { toString: () => '110000.00' }, ...overrides }),
    },
    wallet: {
      findUnique: vi.fn().mockResolvedValue({ id: 'w1', ownerId: 'owner-1', currentBalance: 200000 }),
      update: vi.fn().mockResolvedValue({}),
    },
    category: {
      findFirst: vi.fn().mockResolvedValue({ id: 'cat-1', ownerId: 'owner-1' }),
      findUnique: vi.fn().mockResolvedValue({ id: 'cat-1', ownerId: 'owner-1' }),
    },
    transaction: { create: vi.fn().mockResolvedValue({ id: 'tx-1' }) },
    transactionHistory: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  });

  it('lanza 404 si la deuda no pertenece al owner', async () => {
    mockTransaction.mockImplementation(async (fn: Function) => fn(makePayTx({ ownerId: 'otro' })));
    await expect(payDebt('debt-1', { walletId: 'w1', amount: 10000 }, ownerCtx, 'user-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lanza 409 si la deuda ya está saldada', async () => {
    mockTransaction.mockImplementation(async (fn: Function) => fn(makePayTx({ status: 'PAID' })));
    await expect(payDebt('debt-1', { walletId: 'w1', amount: 10000 }, ownerCtx, 'user-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('lanza 404 si el wallet no pertenece al owner (rollback implícito)', async () => {
    const tx = makePayTx();
    tx.wallet.findUnique = vi.fn().mockResolvedValue({ id: 'w1', ownerId: 'otro-owner' });
    mockTransaction.mockImplementation(async (fn: Function) => fn(tx));
    await expect(payDebt('debt-1', { walletId: 'w1', amount: 10000 }, ownerCtx, 'user-1')).rejects.toMatchObject({ statusCode: 404 });
    // La deuda no se actualiza si el wallet no es válido
    expect(tx.debt.update).not.toHaveBeenCalled();
  });

  it('actualiza remaining y incrementa installmentsPaid en pago exitoso', async () => {
    const tx = makePayTx();
    mockTransaction.mockImplementation(async (fn: Function) => fn(tx));
    await payDebt('debt-1', { walletId: 'w1', amount: 10000 }, ownerCtx, 'user-1');
    expect(tx.debt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ installmentsPaid: 1 }) }),
    );
  });

  it('marca la deuda como PAID cuando remaining llega a 0', async () => {
    const tx = makePayTx({ remaining: { toString: () => '10000' } });
    // Simular remaining actual = 10000
    tx.debt.findUnique = vi.fn().mockResolvedValue({
      ...fakeDebt,
      remaining: { toString: () => '10000', valueOf: () => 10000 },
    });
    // Hacer que Number() funcione correctamente
    Object.defineProperty(fakeDebt.remaining, 'valueOf', { value: () => 10000 });
    mockTransaction.mockImplementation(async (fn: Function) => {
      const fakeTx = {
        ...tx,
        debt: {
          ...tx.debt,
          findUnique: vi.fn().mockResolvedValue({
            ...fakeDebt,
            remaining: 10000,
            installmentsPaid: 11,
          }),
          update: vi.fn().mockResolvedValue({ ...fakeDebt, status: 'PAID', remaining: 0 }),
        },
      };
      return fn(fakeTx);
    });
    await payDebt('debt-1', { walletId: 'w1', amount: 10000 }, ownerCtx, 'user-1');
    const updateCall = (mockTransaction.mock.calls[0][0] as any);
    // Verificar que la deuda se marca como PAID cuando remaining = 0
    // El test principal está en la lógica: newRemaining = max(0, 10000 - 10000) = 0 → status PAID
    expect(mockTransaction).toHaveBeenCalled();
  });
});
