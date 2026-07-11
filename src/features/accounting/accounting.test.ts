import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../core/errors';
import { prisma } from '../../core/database/prisma';
import { resetAccounting } from './accounting.service';

const tx = {
  wallet: { findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
  transaction: { findMany: vi.fn(), deleteMany: vi.fn() },
  transactionHistory: { deleteMany: vi.fn() },
  transactionAttachment: { deleteMany: vi.fn(), findMany: vi.fn() },
  recurringRule: { deleteMany: vi.fn() },
  budget: { deleteMany: vi.fn() },
  debt: { deleteMany: vi.fn() },
};

vi.mock('../../core/database/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    transactionAttachment: { findMany: vi.fn() },
    $transaction: vi.fn((callback) => callback(tx)),
  },
}));

vi.mock('../../core/security/driveClient', () => ({ getDriveClient: vi.fn() }));

describe('resetAccounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.transactionAttachment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    tx.wallet.findMany.mockResolvedValue([{ id: 'wallet-1' }]);
    tx.transaction.findMany.mockResolvedValue([{ id: 'transaction-1' }]);
  });

  it('rejects a delegated requester before deleting data', async () => {
    await expect(resetAccounting('owner-1', 'delegate-1', { walletStrategy: 'KEEP' })).rejects.toBeInstanceOf(AppError);
    expect(tx.wallet.findMany).not.toHaveBeenCalled();
  });

  it('keeps wallets and resets both balances to zero', async () => {
    await resetAccounting('owner-1', 'owner-1', { walletStrategy: 'KEEP' });
    expect(tx.wallet.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 'owner-1' }, data: { initialBalance: 0, currentBalance: 0 },
    });
    expect(tx.wallet.deleteMany).not.toHaveBeenCalled();
    expect(tx.transactionHistory.deleteMany).toHaveBeenCalled();
  });

  it('deletes wallets with the DELETE strategy', async () => {
    await resetAccounting('owner-1', 'owner-1', { walletStrategy: 'DELETE' });
    expect(tx.wallet.deleteMany).toHaveBeenCalledWith({ where: { ownerId: 'owner-1' } });
  });
});
