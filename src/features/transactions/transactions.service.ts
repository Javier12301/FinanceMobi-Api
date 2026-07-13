import { prisma } from '../../core/database/prisma';
import { AppError } from '../../core/errors';
import { getDriveClient } from '../../core/security/driveClient';
import type { CreateTransactionInput, UpdateTransactionInput, ListTransactionFiltersInput } from './transactions.schema';

interface OwnerContext {
  ownerId: string;
  role: 'OWNER' | 'SUPERVISOR' | 'ASESOR';
}

// Frontera única entre "ya ocurrió" y "es futuro": un movimiento es PENDING sii su fecha cae
// en un día posterior a hoy. Misma frontera al crear y al barrer, para que no queden huecos.
// ponytail: hora local del server; si algún día importan zonas horarias por owner, mover acá.
function startOfTomorrow(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d;
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

  // TRANSFER no lleva categoría; INCOME/EXPENSE sí (el schema ya lo exige). Validar ownership solo si viene.
  if (input.categoryId) {
    const category = await tx.category.findUnique({ where: { id: input.categoryId } });
    if (!category || category.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Categoría no encontrada');
  }

  if (input.movementType === 'TRANSFER') {
    if (!input.destinationWalletId) throw new AppError(400, 'destinationWalletId requerido para TRANSFER');
    if (input.destinationWalletId === input.walletId) throw new AppError(400, 'La billetera origen y destino no pueden ser la misma');
    const destCheck = await tx.wallet.findUnique({ where: { id: input.destinationWalletId }, select: { id: true, ownerId: true } });
    if (!destCheck || destCheck.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Billetera destino no encontrada');
  }

  // Gasto futuro: si la fecha cae en un día posterior a hoy, el movimiento nace PENDING y NO toca
  // el saldo. postDuePendingTransactions lo postea cuando llega su fecha.
  if (new Date(input.date) >= startOfTomorrow()) {
    const pendingTx = await tx.transaction.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        walletId: input.walletId,
        destinationWalletId: input.destinationWalletId,
        categoryId: input.categoryId ?? null,
        amount: input.amount,
        description: input.description,
        date: new Date(input.date),
        movementType: input.movementType,
        status: 'PENDING',
        debtId: input.debtId ?? null,
      },
    });

    await tx.transactionHistory.create({
      data: { transactionId: pendingTx.id, modifiedById: userId, action: 'CREATE', newSnapshot: pendingTx },
    });

    return pendingTx;
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
      categoryId: input.categoryId ?? null,
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

// Postea los gastos futuros cuya fecha ya llegó. Materialización perezosa (mismo patrón que
// recurring.getPendingRules): se dispara en el GET de transacciones, sin cron — el servidor es una
// PC que no siempre está prendida. Cada pendiente va en su propia $transaction con FOR UPDATE para
// que dos requests concurrentes no lo posteen dos veces.
interface PostOptions {
  /** Pisa la fecha del movimiento con "ahora". Lo usa el posteo anticipado ("ya se me descontó"). */
  dateToNow?: boolean;
  /** Falla con 409 si el movimiento no está PENDING, en vez de ignorarlo en silencio. */
  strict?: boolean;
}

async function postOnePendingAtomically(
  transactionId: string,
  ownerContext: OwnerContext,
  userId: string,
  opts: PostOptions = {},
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await (tx as any).$queryRaw`SELECT id FROM Transaction WHERE id = ${transactionId} FOR UPDATE`;

    const t = await tx.transaction.findUnique({ where: { id: transactionId } });
    // Otra request pudo haberlo posteado o borrado mientras esperábamos el lock. En el barrido eso
    // se ignora; cuando el usuario lo pidió explícitamente, hay que avisarle.
    if (!t || t.deletedAt) {
      if (opts.strict) throw new AppError(404, 'Movimiento no encontrado');
      return;
    }
    if (t.status !== 'PENDING') {
      if (opts.strict) throw new AppError(409, 'El movimiento ya está registrado');
      return;
    }

    const lockIds = t.movementType === 'TRANSFER' && t.destinationWalletId
      ? [t.walletId, t.destinationWalletId].sort()
      : [t.walletId];
    for (const wid of lockIds) {
      await (tx as any).$queryRaw`SELECT id FROM Wallet WHERE id = ${wid} FOR UPDATE`;
    }

    const wallet = await tx.wallet.findUnique({ where: { id: t.walletId } });
    if (!wallet || wallet.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Billetera no encontrada');

    const amount = Number(t.amount);
    let newBalance = Number(wallet.currentBalance);
    if (t.movementType === 'INCOME') {
      newBalance += amount;
    } else if (t.movementType === 'EXPENSE') {
      newBalance -= amount;
    } else if (t.movementType === 'TRANSFER' && t.destinationWalletId) {
      const dest = await tx.wallet.findUnique({ where: { id: t.destinationWalletId } });
      if (!dest) throw new AppError(500, 'Billetera destino no encontrada');
      await tx.wallet.update({
        where: { id: t.destinationWalletId },
        data: { currentBalance: Number(dest.currentBalance) + amount },
      });
      newBalance -= amount;
    }

    await tx.wallet.update({ where: { id: t.walletId }, data: { currentBalance: newBalance } });

    const posted = await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'POSTED',
        // Posteo anticipado: si la plata ya salió, salió hoy. Sin esto quedaría un movimiento que
        // afecta el saldo pero con fecha futura, y no entraría en los totales del mes en curso.
        ...(opts.dateToNow ? { date: new Date() } : {}),
      },
    });

    await tx.transactionHistory.create({
      data: { transactionId, modifiedById: userId, action: 'POST', oldSnapshot: t as any, newSnapshot: posted as any },
    });
  });
}

/**
 * "Ya se me descontó": postea un gasto/ingreso futuro AHORA, sin esperar a su fecha y sin que el
 * usuario tenga que editarla. Aplica el saldo y estampa la fecha de hoy.
 */
export async function postTransactionNow(
  transactionId: string,
  ownerContext: OwnerContext,
  userId: string,
): Promise<void> {
  await postOnePendingAtomically(transactionId, ownerContext, userId, { dateToNow: true, strict: true });
}

export async function postDuePendingTransactions(
  ownerId: string,
  userId: string,
  ownerContext: OwnerContext,
): Promise<void> {
  const wallets = await prisma.wallet.findMany({ where: { ownerId }, select: { id: true } });
  const walletIds = wallets.map((w) => w.id);
  if (walletIds.length === 0) return;

  const due = await prisma.transaction.findMany({
    where: {
      walletId: { in: walletIds },
      status: 'PENDING',
      deletedAt: null,
      date: { lt: startOfTomorrow() },
    },
    select: { id: true },
  });

  // Un pendiente que falla no debe tumbar el listado del resto.
  await Promise.allSettled(due.map((t) => postOnePendingAtomically(t.id, ownerContext, userId)));
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
    // Los gastos futuros (PENDING) no se mezclan con los movimientos reales: hay que pedirlos.
    status: filters?.status ?? 'POSTED',
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
    if (oldTx.movementType === 'ADJUSTMENT') {
      throw new AppError(409, 'Los ajustes de saldo no se pueden editar');
    }

    // Un PENDING nunca aplicó saldo: editarlo solo cambia sus campos, sin deltas ni locks. Si la
    // nueva fecha ya venció, el próximo barrido lo postea (caso "lo adelanté del 15 al 2").
    if (oldTx.status === 'PENDING') {
      if (input.categoryId) {
        const cat = await tx.category.findUnique({ where: { id: input.categoryId } });
        if (!cat || cat.ownerId !== ownerContext.ownerId) throw new AppError(404, 'Categoría no encontrada');
      }

      const pendingWalletId = input.walletId ?? oldTx.walletId;
      const pendingDestId =
        oldTx.movementType === 'TRANSFER' ? (input.destinationWalletId ?? oldTx.destinationWalletId) : null;

      if (oldTx.movementType === 'TRANSFER' && pendingDestId === pendingWalletId) {
        throw new AppError(400, 'La billetera origen y destino no pueden ser la misma');
      }

      const updatedPending = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          categoryId: input.categoryId ?? oldTx.categoryId,
          amount: input.amount ?? oldTx.amount,
          description: input.description ?? oldTx.description,
          date: input.date ? new Date(input.date) : oldTx.date,
          walletId: pendingWalletId,
          destinationWalletId: pendingDestId,
        },
      });

      await tx.transactionHistory.create({
        data: {
          transactionId,
          modifiedById: userId,
          action: 'UPDATE',
          oldSnapshot: oldTx,
          newSnapshot: updatedPending,
        },
      });

      return updatedPending;
    }

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

  if (transaction.movementType === 'ADJUSTMENT') {
    throw new AppError(409, 'Los ajustes de saldo no se pueden eliminar');
  }
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

    // Un PENDING nunca aplicó saldo: no hay nada que revertir, solo se borra.
    if (transaction.status !== 'PENDING') {
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
