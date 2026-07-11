import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adjustWalletBalance } from './wallets.service';

const tx = {
  $queryRaw: vi.fn(),
  wallet: { findUnique: vi.fn(), update: vi.fn() },
  transaction: { findUnique: vi.fn(), create: vi.fn() },
  transactionHistory: { create: vi.fn() },
};

vi.mock('../../core/database/prisma', () => ({ prisma: { $transaction: vi.fn((callback) => callback(tx)) } }));

describe('adjustWalletBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', ownerId: 'owner-1', currentBalance: 100 });
    tx.transaction.findUnique.mockResolvedValue(null);
    tx.transaction.create.mockResolvedValue({ id: 'adjustment-1', walletId: 'wallet-1', movementType: 'ADJUSTMENT' });
  });

  it('records a positive delta and writes the target balance', async () => {
    await adjustWalletBalance('wallet-1', 'owner-1', 'owner-1', { targetBalance: 250 });
    expect(tx.transaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 150, movementType: 'ADJUSTMENT' }) }));
    expect(tx.wallet.update).toHaveBeenCalledWith({ where: { id: 'wallet-1' }, data: { currentBalance: 250 } });
  });

  it('records a negative delta', async () => {
    await adjustWalletBalance('wallet-1', 'owner-1', 'owner-1', { targetBalance: 40 });
    expect(tx.transaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: -60 }) }));
  });

  it('returns an existing adjustment for an idempotent retry', async () => {
    const existing = { id: 'idempotent-id', walletId: 'wallet-1', movementType: 'ADJUSTMENT' };
    tx.transaction.findUnique.mockResolvedValue(existing);
    await expect(adjustWalletBalance('wallet-1', 'owner-1', 'owner-1', { id: 'idempotent-id', targetBalance: 250 })).resolves.toEqual(existing);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
});
