import { prisma } from '../../core/database/prisma';
import { redis } from '../../core/database/redis';
import { verifyPassword, hashPassword, DUMMY_HASH } from '../../core/security/password';
import { signToken, tokenTtlSeconds } from '../../core/security/jwt';
import { verifyGoogleIdToken } from '../../core/security/googleAuth';
import { AppError } from '../../core/errors';

const GENERIC_LOGIN_ERROR = 'Credenciales incorrectas';

export async function loginWithCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Tiempo constante: siempre verificamos contra un hash bcrypt real aunque el usuario no exista
  const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
  const valid = await verifyPassword(password, hashToCheck);

  if (!user || !valid) throw new AppError(401, GENERIC_LOGIN_ERROR);

  return issueSession(user.id, user.email);
}

export async function issueSession(userId: string, email: string) {
  const token = signToken(userId, email);

  // Extraer jti del token ya firmado para guardar en Redis
  const { jti } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const ttl = tokenTtlSeconds();

  await redis.set(`session:${userId}:${jti}`, '1', 'EX', ttl);

  return { token };
}

export async function logout(userId: string, jti: string) {
  await redis.del(`session:${userId}:${jti}`);
}

export async function loginWithGoogle(idToken: string) {
  // verifyGoogleIdToken lanza AppError(401) si el token es inválido
  const { sub: googleId, email } = await verifyGoogleIdToken(idToken);

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId }, { email }] },
  });

  if (!user) {
    user = await prisma.user.create({
      data: { googleId, email, name: email.split('@')[0] },
    });
  }

  // El id_token de Google se descarta aquí — nunca se persiste
  return issueSession(user.id, user.email);
}

const DEFAULT_CATEGORIES = [
  { movementType: 'EXPENSE', name: 'Comida',       icon: 'utensils',  color: '#F97316' },
  { movementType: 'EXPENSE', name: 'Transporte',   icon: 'bus',       color: '#3B82F6' },
  { movementType: 'EXPENSE', name: 'Servicios',    icon: 'lightbulb', color: '#F59E0B' },
  { movementType: 'EXPENSE', name: 'Supermercado', icon: 'cart',      color: '#10B981' },
  { movementType: 'EXPENSE', name: 'Salud',        icon: 'health',    color: '#EF4444' },
  { movementType: 'EXPENSE', name: 'Ocio',         icon: 'drama',     color: '#8B5CF6' },
  { movementType: 'INCOME',  name: 'Sueldo',       icon: 'wallet',    color: '#22C55E' },
  { movementType: 'EXPENSE', name: 'Otros',        icon: 'tag',       color: '#6366F1' },
] as const;

export async function registerWithCredentials(name: string, email: string, password: string) {
  // Pre-check para 409 rápido; el catch P2002 cubre la race condition
  const existingUser = await prisma.user.findFirst({ where: { email } });
  if (existingUser) throw new AppError(409, 'Email ya registrado');

  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { name, email, passwordHash },
      });

      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map((cat) => ({
          ownerId: newUser.id,
          movementType: cat.movementType,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
        })),
      });

      const cashType = await tx.walletType.findFirst({ where: { name: 'CASH' } });
      if (!cashType) throw new AppError(500, 'WalletType CASH no encontrado');

      await tx.wallet.create({
        data: { ownerId: newUser.id, typeId: cashType.id, name: 'Efectivo', initialBalance: 0, currentBalance: 0 },
      });

      return newUser;
    });

    return issueSession(user.id, user.email);
  } catch (err: any) {
    // ponytail: P2002 cubre race condition entre pre-check y create
    if (err?.code === 'P2002') throw new AppError(409, 'Email ya registrado');
    throw err;
  }
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'Usuario no encontrado');

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    driveConnected: !!user.encryptedGoogleRefreshToken && !!user.driveFolderId,
  };
}
