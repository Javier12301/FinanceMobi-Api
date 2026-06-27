import { prisma } from '../../core/database/prisma';
import { AppError } from '../../core/errors';

export async function getDelegations(userId: string) {
  const delegations = await prisma.userDelegation.findMany({
    where: {
      active: true,
      OR: [{ ownerId: userId }, { delegatedUserId: userId }],
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      delegated: { select: { id: true, name: true, email: true } },
    },
  });

  // Separar granted (ownerId === userId) y managing (delegatedUserId === userId)
  const granted = delegations
    .filter((d) => d.ownerId === userId)
    .map((d) => ({
      id: d.id,
      role: d.role,
      user: d.delegated,
    }));

  const managing = delegations
    .filter((d) => d.delegatedUserId === userId)
    .map((d) => ({
      id: d.id,
      role: d.role,
      user: d.owner,
    }));

  return { granted, managing };
}

export async function createDelegation(ownerId: string, email: string, role: 'SUPERVISOR' | 'ASESOR') {
  // 1. Buscar usuario por email
  const targetUser = await prisma.user.findFirst({ where: { email } });
  if (!targetUser) throw new AppError(404, 'Usuario no encontrado');

  // 2. Auto-delegación
  if (targetUser.id === ownerId) throw new AppError(400, 'No puedes delegarte a ti mismo');

  // 3. Verificar no existe delegación activa; reactivar si existe inactiva
  const existing = await prisma.userDelegation.findUnique({
    where: { ownerId_delegatedUserId: { ownerId, delegatedUserId: targetUser.id } },
  });
  if (existing) {
    if (existing.active) throw new AppError(409, 'Delegación ya activa');
    // ponytail: @@unique impide create si existe row inactiva — usar update
    return prisma.userDelegation.update({
      where: { id: existing.id },
      data: { active: true, role },
    });
  }

  return prisma.userDelegation.create({
    data: { ownerId, delegatedUserId: targetUser.id, role, active: true },
  });
}

export async function revokeDelegation(delegationId: string, requesterId: string) {
  // 1. Cargar delegación
  const delegation = await prisma.userDelegation.findUnique({ where: { id: delegationId } });
  if (!delegation) throw new AppError(404, 'Delegación no encontrada');

  // 2. Verificar ownership
  if (delegation.ownerId !== requesterId) throw new AppError(403, 'No autorizado');

  // 3. Desactivar
  await prisma.userDelegation.update({
    where: { id: delegationId },
    data: { active: false },
  });
}
