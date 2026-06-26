import { prisma } from '../../core/database/prisma';
import { redis } from '../../core/database/redis';
import { verifyPassword } from '../../core/security/password';
import { signToken, tokenTtlSeconds } from '../../core/security/jwt';
import { AppError } from '../../core/errors';

const GENERIC_LOGIN_ERROR = 'Credenciales incorrectas';

export async function loginWithCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Tiempo constante: siempre verificamos aunque no exista el usuario
  const hashToCheck = user?.passwordHash ?? '$2a$12$invalidhashpadding000000000000000000000000000000000000000';
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
