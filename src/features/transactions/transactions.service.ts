import { prisma } from '../../core/database/prisma';
import { AppError } from '../../core/errors';
import { getDriveClient } from '../../core/security/driveClient';
import type { CreateTransactionInput, UpdateTransactionInput, ListTransactionFiltersInput } from './transactions.schema';

interface OwnerContext {
  ownerId: string;
  role: 'OWNER' | 'SUPERVISOR' | 'ASESOR';
}

// ponytail: helper extraído para permitir composición en transacciones externas (e.g. debt payment)
export async function createTransactionInTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: CreateTransactionInput,
  ownerContext: OwnerContext,
  userId: string,
) {
  // Idempotencia: si el cliente reenvía un alta ya aplicada (mismo id), devolver la existente
  // sin re-crear ni re-aplicar el balance. Cubre el replay del outbox offline.
  if (input.id) {
    const existing = await tx.transaction.findUnique({ where: { id: input.id } });
    if (existing) return existing;
  }

  // Validar existencia y ownership antes de tomar locks
  const walletCheck = await tx.wallet.findUnique({ where: { id: input.walletId }, select: { id: true, ownerId: true } });
  if (!walletCheck || walletCheck.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Billetera no encontrada');

  const category = await tx.category.findUnique({ where: { id: input.categoryId } });
  if (!category || category.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Categoría no encontrada');

  if (input.movementType === 'TRANSFER') {
    if (!input.destinationWalletId) throw new AppError(400, 'destinationWalletId requerido para TRANSFER');
    if (input.destinationWalletId === input.walletId) throw new AppError(400, 'La billetera origen y destino no pueden ser la misma');
    const destCheck = await tx.wallet.findUnique({ where: { id: input.destinationWalletId }, select: { id: true, ownerId: true } });
    if (!destCheck || destCheck.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Billetera destino no encontrada');
  }

  // Locks deterministicos por id (previene deadlock en transferencias cruzadas concurrentes)
  const lockIds = input.movementType === 'TRANSFER' && input.destinationWalletId
    ? [input.walletId, input.destinationWalletId].sort()
    : [input.walletId];
  for (const wid of lockIds) {
    await (tx as any).$queryRaw`SELECT id FROM Wallet WHERE id = ${wid} FOR UPDATE`;
  }

  // Leer balances DESPUÉS de los locks
  const wallet = await tx.wallet.findUnique({ where: { id: input.walletId } });
  if (!wallet) throw new AppError(500, 'Billetera no encontrada tras lock');

  let newBalance = Number(wallet.currentBalance);
  if (input.movementType === 'INCOME') {
    newBalance += input.amount;
  } else if (input.movementType === 'EXPENSE') {
    newBalance -= input.amount;
  } else if (input.movementType === 'TRANSFER' && input.destinationWalletId) {
    const destWallet = await tx.wallet.findUnique({ where: { id: input.destinationWalletId } });
    if (!destWallet) throw new AppError(500, 'Billetera destino no encontrada tras lock');
    const destNewBalance = Number(destWallet.currentBalance) + input.amount;
    await tx.wallet.update({ where: { id: input.destinationWalletId }, data: { currentBalance: destNewBalance } });
    newBalance -= input.amount;
  }

  await tx.wallet.update({ where: { id: input.walletId }, data: { currentBalance: newBalance } });

  const transaction = await tx.transaction.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      walletId: input.walletId,
      destinationWalletId: input.destinationWalletId,
      categoryId: input.categoryId,
      amount: input.amount,
      description: input.description,
      date: new Date(input.date),
      movementType: input.movementType,
      debtId: input.debtId ?? null,
    },
  });

  await tx.transactionHistory.create({
    data: { transactionId: transaction.id, modifiedById: userId, action: 'CREATE', newSnapshot: transaction },
  });

  return transaction;
}

export async function createTransaction(input: CreateTransactionInput, ownerContext: OwnerContext, userId: string) {
  if (input.amount <= 0) {
    throw new AppError(400, 'El monto debe ser positivo');
  }
  return prisma.$transaction((tx) => createTransactionInTx(tx, input, ownerContext, userId));
}

export async function listTransactions(ownerId: string, filters?: ListTransactionFiltersInput, hasQueryParams = false) {
  const wallets = await prisma.wallet.findMany({ where: { ownerId }, select: { id: true } });
  const walletIds = wallets.map((w) => w.id);

  if (filters?.walletId && !walletIds.includes(filters.walletId)) {
    if (!hasQueryParams) return [];
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    return { items: [], total: 0, page, pageSize };
  }

  const where: any = {
    walletId: { in: filters?.walletId ? [filters.walletId] : walletIds },
    deletedAt: null,
  };
  if (filters?.categoryId) where.categoryId = filters.categoryId;
  if (filters?.debtId) where.debtId = filters.debtId;
  if (filters?.type) where.movementType = filters.type;

  // Soporte V3 (dateFrom/dateTo) y V4 (from/to) — ambos alimentan where.date
  const dateFrom = filters?.from ?? filters?.dateFrom;
  const dateTo = filters?.to ?? filters?.dateTo;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) where.date.lte = new Date(dateTo);
  }

  if (filters?.q) {
    where.description = { contains: filters.q };
  }

  // Sin query params → V3 compat: array plano
  if (!hasQueryParams) {
    return prisma.transaction.findMany({ where });
  }

  // Con paginación → V4: { items, total, page, pageSize }
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 50;
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { date: 'desc' } }),
    prisma.transaction.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function updateTransaction(
  transactionId: string,
  input: UpdateTransactionInput,
  userId: string,
  ownerContext: OwnerContext,
) {
  return prisma.$transaction(async (tx) => {
    const oldTx = await tx.transaction.findFirst({ where: { id: transactionId, deletedAt: null } });
    if (!oldTx) throw new AppError(404, 'Transacción no encontrada');

    // El movementType es inmutable en edición. Valores finales: lo que no viene en input queda igual.
    const movementType = oldTx.movementType;
    const finalAmount = input.amount ?? Number(oldTx.amount);
    const finalWalletId = input.walletId ?? oldTx.walletId;
    const finalDestId =
      movementType === 'TRANSFER' ? (input.destinationWalletId ?? oldTx.destinationWalletId) : null;

    // Validaciones de forma
    if (movementType === 'TRANSFER') {
      if (!finalDestId) throw new AppError(400, 'destinationWalletId requerido para TRANSFER');
      if (finalDestId === finalWalletId) {
        throw new AppError(400, 'La billetera origen y destino no pueden ser la misma');
      }
    } else if (input.destinationWalletId) {
      throw new AppError(400, 'destinationWalletId solo aplica a TRANSFER');
    }

    // Ownership del nuevo categoryId si se cambia
    if (input.categoryId) {
      const cat = await tx.category.findUnique({ where: { id: input.categoryId } });
      if (!cat || cat.ownerId !== ownerContext.ownerId) {
        throw new AppError(404, 'Categoría no encontrada');
      }
    }

    // Billeteras afectadas = viejas (a revertir) + nuevas (a aplicar), únicas.
    const affectedIds = Array.from(
      new Set(
        [
          oldTx.walletId,
          oldTx.destinationWalletId ?? undefined,
          finalWalletId,
          finalDestId ?? undefined,
        ].filter((id): id is string => !!id),
      ),
    );

    // Locks deterministas (orden por id) sobre TODAS las afectadas → evita deadlock (create L40-42).
    for (const wid of [...affectedIds].sort()) {
      await (tx as any).$queryRaw`SELECT id FROM Wallet WHERE id = ${wid} FOR UPDATE`;
    }

    // Cargar balances DESPUÉS de los locks y validar ownership de cada billetera afectada.
    const walletsById = new Map<string, { id: string; ownerId: string; currentBalance: unknown }>();
    for (const wid of affectedIds) {
      const w = await tx.wallet.findUnique({ where: { id: wid } });
      if (!w || w.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Billetera no encontrada');
      walletsById.set(wid, w as any);
    }

    // Delta por billetera: revertir el impacto viejo y aplicar el nuevo. Setea valores absolutos
    // desde oldTx persistido → reejecutar el mismo PUT da delta neto 0 (replay-safe para el outbox).
    const delta = new Map<string, number>();
    const add = (wid: string, d: number) => delta.set(wid, (delta.get(wid) ?? 0) + d);
    const oldAmount = Number(oldTx.amount);
    if (movementType === 'INCOME') {
      add(oldTx.walletId, -oldAmount);
      add(finalWalletId, +finalAmount);
    } else if (movementType === 'EXPENSE') {
      add(oldTx.walletId, +oldAmount);
      add(finalWalletId, -finalAmount);
    } else if (movementType === 'TRANSFER') {
      add(oldTx.walletId, +oldAmount);
      add(oldTx.destinationWalletId as string, -oldAmount);
      add(finalWalletId, -finalAmount);
      add(finalDestId as string, +finalAmount);
    }

    for (const [wid, d] of delta) {
      if (d === 0) continue;
      const w = walletsById.get(wid)!;
      await tx.wallet.update({ where: { id: wid }, data: { currentBalance: Number(w.currentBalance) + d } });
    }

    const updatedTx = await tx.transaction.update({
      where: { id: transactionId },
      data: {
        categoryId: input.categoryId ?? oldTx.categoryId,
        amount: input.amount ?? oldTx.amount,
        description: input.description ?? oldTx.description,
        date: input.date ? new Date(input.date) : oldTx.date,
        walletId: finalWalletId,
        destinationWalletId: finalDestId,
      },
    });

    await tx.transactionHistory.create({
      data: {
        transactionId: transactionId,
        modifiedById: userId,
        action: 'UPDATE',
        oldSnapshot: oldTx,
        newSnapshot: updatedTx,
      },
    });

    return updatedTx;
  });
}

export async function deleteTransaction(
  transactionId: string,
  ownerContext: OwnerContext,
  userId: string,
) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, deletedAt: null },
    include: { wallet: true, attachments: true, destinationWallet: true },
  });
  if (!transaction) throw new AppError(404, 'Transacción no encontrada');

  if (transaction.wallet.ownerId !== ownerContext.ownerId) {
    throw new AppError(403, 'No autorizado');
  }

  // Drive primero: si hay attachments, Drive es obligatorio
  if (transaction.attachments.length > 0) {
    const user = await prisma.user.findUnique({ where: { id: ownerContext.ownerId } });
    if (!user?.encryptedGoogleRefreshToken) {
      throw new AppError(409, 'Google Drive no conectado — no se pueden borrar los adjuntos');
    }
    const drive = getDriveClient(user.encryptedGoogleRefreshToken);
    for (const att of transaction.attachments) {
      await drive.files.delete({ fileId: att.googleFileId });
    }
  }

  // ponytail: soft delete — FK ON DELETE RESTRICT en TransactionHistory impide hard delete
  await prisma.$transaction(async (tx) => {
    await (tx as any).$queryRaw`SELECT id FROM Wallet WHERE id = ${transaction.walletId} FOR UPDATE`;
    if (transaction.destinationWalletId) {
      await (tx as any).$queryRaw`SELECT id FROM Wallet WHERE id = ${transaction.destinationWalletId} FOR UPDATE`;
    }

    const amount = Number(transaction.amount);
    const wallet = await tx.wallet.findUnique({ where: { id: transaction.walletId } });
    if (!wallet) throw new AppError(500, 'Billetera no encontrada');

    if (transaction.movementType === 'INCOME') {
      await tx.wallet.update({ where: { id: transaction.walletId }, data: { currentBalance: Number(wallet.currentBalance) - amount } });
    } else if (transaction.movementType === 'EXPENSE') {
      await tx.wallet.update({ where: { id: transaction.walletId }, data: { currentBalance: Number(wallet.currentBalance) + amount } });
    } else if (transaction.movementType === 'TRANSFER' && transaction.destinationWalletId) {
      const destWallet = await tx.wallet.findUnique({ where: { id: transaction.destinationWalletId } });
      if (!destWallet) throw new AppError(500, 'Billetera destino no encontrada');
      await tx.wallet.update({ where: { id: transaction.walletId }, data: { currentBalance: Number(wallet.currentBalance) + amount } });
      await tx.wallet.update({ where: { id: transaction.destinationWalletId }, data: { currentBalance: Number(destWallet.currentBalance) - amount } });
    }

    await tx.transactionHistory.create({
      data: { transactionId: transaction.id, modifiedById: userId, action: 'DELETE', oldSnapshot: transaction as any, newSnapshot: {} as any },
    });

    // Attachments: hard delete (no FK apunta desde otro lado)
    await tx.transactionAttachment.deleteMany({ where: { transactionId } });
    // Transaction: soft delete para preservar historial de auditoría
    await tx.transaction.update({ where: { id: transactionId }, data: { deletedAt: new Date() } });
  });
}
