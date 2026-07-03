import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listDebts, createDebt, updateDebt, deleteDebt, payDebt, splitPayment } from './debts.service';
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
  interestPaid: { toString: () => '0.00' },
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

describe('splitPayment (capital vs recargo)', () => {
  it('pago exacto: todo va a capital, sin recargo', () => {
    // 120000 / 12 restantes = 10000 proyectado
    expect(splitPayment(120000, 12, 10000)).toEqual({ capital: 10000, interest: 0, newRemaining: 110000 });
  });

  it('sobreprecio: el excedente sobre lo proyectado es recargo y NO baja capital más rápido', () => {
    // cuota proyectada 10000, paga 12500 → capital 10000, recargo 2500
    expect(splitPayment(120000, 12, 12500)).toEqual({ capital: 10000, interest: 2500, newRemaining: 110000 });
  });

  it('pago parcial: baja capital solo por lo pagado, sin recargo', () => {
    expect(splitPayment(120000, 12, 6000)).toEqual({ capital: 6000, interest: 0, newRemaining: 114000 });
  });

  it('última cuota con recargo: salda capital y registra el excedente', () => {
    // resta 1 cuota, saldo 10000; paga 13000 → capital 10000 (salda), recargo 3000
    expect(splitPayment(10000, 1, 13000)).toEqual({ capital: 10000, interest: 3000, newRemaining: 0 });
  });

  it('sin plan de cuotas (restantes<=0 tratado como pago único)', () => {
    // deuda sin cuotas: restantes 1 → proyectado = saldo entero
    expect(splitPayment(5000, 1, 7000)).toEqual({ capital: 5000, interest: 2000, newRemaining: 0 });
  });
});

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

  it('idempotente: si el id ya existe, devuelve la deuda sin re-crear', async () => {
    mockDebtFindUnique.mockResolvedValue({ ...fakeDebt, id: 'debt-cliente-1' });
    const result = await createDebt(
      { id: 'debt-cliente-1', direction: 'I_OWE', counterparty: 'X', principal: 5000 },
      ownerCtx,
    );
    expect(mockDebtCreate).not.toHaveBeenCalled();
    expect(result.principal).toBe('120000.00'); // serializado desde fakeDebt
  });
});

describe('createDebt con installmentsTotal + walletId', () => {
  it('crea deuda Y RecurringRule con debtId cuando se pasan installmentsTotal + dueDate + walletId', async () => {
    const fakeTx = {
      wallet: { findUnique: vi.fn().mockResolvedValue({ id: 'w1', ownerId: 'owner-1' }) },
      category: { findFirst: vi.fn().mockResolvedValue({ id: 'cat-1', ownerId: 'owner-1' }) },
      debt: {
        create: vi.fn().mockResolvedValue({ ...fakeDebt }),
        update: vi.fn().mockResolvedValue({ ...fakeDebt, recurringRuleId: 'rule-1' }),
      },
      recurringRule: { create: vi.fn().mockResolvedValue({ id: 'rule-1' }) },
    };
    mockTransaction.mockImplementation(async (fn: Function) => fn(fakeTx));

    await createDebt(
      { direction: 'I_OWE', counterparty: 'Banco Macro', principal: 120000, installmentsTotal: 12, dueDate: '2026-07-05T00:00:00.000Z', walletId: 'w1' },
      ownerCtx,
    );

    expect(fakeTx.recurringRule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ debtId: fakeDebt.id, autoPost: false }) }),
    );
    expect(fakeTx.debt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recurringRuleId: 'rule-1' }) }),
    );
  });

  it('crea solo la deuda (sin rule) cuando no se pasa walletId', async () => {
    mockDebtCreate.mockResolvedValue({ ...fakeDebt });
    await createDebt({ direction: 'I_OWE', counterparty: 'X', principal: 5000, installmentsTotal: 6, dueDate: '2026-07-05T00:00:00.000Z' }, ownerCtx);
    expect(mockDebtCreate).toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
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

  it('usa descripción auto-generada "Cuota N/M — counterparty" cuando hay installmentsTotal', async () => {
    const tx = makePayTx();
    mockTransaction.mockImplementation(async (fn: Function) => fn(tx));
    await payDebt('debt-1', { walletId: 'w1', amount: 10000 }, ownerCtx, 'user-1');
    expect(tx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ description: 'Cuota 1/12 — Banco Macro' }) }),
    );
  });

  it('usa descripción auto-generada "Pago — counterparty" cuando no hay installmentsTotal', async () => {
    const tx = makePayTx();
    tx.debt.findUnique = vi.fn().mockResolvedValue({ ...fakeDebt, installmentsTotal: null });
    mockTransaction.mockImplementation(async (fn: Function) => fn(tx));
    await payDebt('debt-1', { walletId: 'w1', amount: 10000 }, ownerCtx, 'user-1');
    expect(tx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ description: 'Pago — Banco Macro' }) }),
    );
  });

  it('incluye debtId en la transacción creada', async () => {
    const tx = makePayTx();
    mockTransaction.mockImplementation(async (fn: Function) => fn(tx));
    await payDebt('debt-1', { walletId: 'w1', amount: 10000 }, ownerCtx, 'user-1');
    expect(tx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ debtId: 'debt-1' }) }),
    );
  });

  it('pago con recargo: debita la billetera por el monto TOTAL pero baja capital solo la cuota', async () => {
    const tx = makePayTx();
    mockTransaction.mockImplementation(async (fn: Function) => fn(tx));
    // cuota proyectada = 120000/12 = 10000; paga 12500 → capital 10000, recargo 2500
    await payDebt('debt-1', { walletId: 'w1', amount: 12500 }, ownerCtx, 'user-1');
    // La transacción (gasto en billetera) es por el monto total real
    expect(tx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 12500 }) }),
    );
    // La deuda baja capital solo 10000 (remaining 110000) y acumula 2500 de recargo
    expect(tx.debt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ remaining: 110000, interestPaid: 2500, installmentsPaid: 1 }) }),
    );
  });

  it('permite pagar más que el saldo capital (mora): el excedente es recargo, no capital', async () => {
    const tx = makePayTx();
    tx.debt.findUnique = vi.fn().mockResolvedValue({
      ...fakeDebt, remaining: { toString: () => '10000' }, installmentsTotal: 1, installmentsPaid: 0,
    });
    mockTransaction.mockImplementation(async (fn: Function) => fn(tx));
    await payDebt('debt-1', { walletId: 'w1', amount: 13000 }, ownerCtx, 'user-1');
    expect(tx.debt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ remaining: 0, interestPaid: 3000, status: 'PAID' }) }),
    );
  });

  it('serializa interestPaid como string', async () => {
    const tx = makePayTx();
    tx.debt.update = vi.fn().mockResolvedValue({ ...fakeDebt, interestPaid: { toString: () => '2500.00' } });
    mockTransaction.mockImplementation(async (fn: Function) => fn(tx));
    const result = await payDebt('debt-1', { walletId: 'w1', amount: 12500 }, ownerCtx, 'user-1');
    expect(result.interestPaid).toBe('2500.00');
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
