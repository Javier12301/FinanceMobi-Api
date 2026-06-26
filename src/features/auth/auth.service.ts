import { prisma } from '../../core/database/prisma';
import { redis } from '../../core/database/redis';
import { verifyPassword, DUMMY_HASH } from '../../core/security/password';
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
