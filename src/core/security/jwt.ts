import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';

export interface JwtPayload {
  sub: string;
  email: string;
  jti: string;
}

/** TTL en segundos a partir de JWT_EXPIRES_IN (ej. "7d" → 604800). */
export function tokenTtlSeconds(): number {
  const raw = env.JWT_EXPIRES_IN;
  const match = raw.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 3600;
  const n = parseInt(match[1], 10);
  const unit: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (unit[match[2]] ?? 1);
}

export function signToken(userId: string, email: string): string {
  const payload: JwtPayload = { sub: userId, email, jti: uuidv4() };
  // ponytail: pasamos segundos numéricos para evitar el tipo StringValue de jsonwebtoken
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: tokenTtlSeconds() });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
