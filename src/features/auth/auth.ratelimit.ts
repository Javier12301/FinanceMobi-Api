import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../../core/database/redis';
import { env } from '../../core/config/env';
import type { RequestHandler } from 'express';

// ponytail: passthrough en desarrollo para no bloquear pruebas manuales
export const authRateLimiter: RequestHandler =
  env.NODE_ENV === 'development'
    ? (_req, _res, next) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutos
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
        store: new RedisStore({
          sendCommand: (command: string, ...args: string[]) =>
            redis.call(command, ...args) as Promise<number | string>,
        }),
      });
