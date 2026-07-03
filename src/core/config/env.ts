import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  // 90d: los clientes mobile operan offline con el server apagado; una sesión corta forzaría
  // re-login cada vez que el dueño prende la PC. Redis persiste la sesión (docker-compose: appendonly).
  JWT_EXPIRES_IN: z.string().default('90d'),
  // AES-256-GCM key: 32 bytes como 64 chars hexadecimales
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY debe ser exactamente 64 caracteres hexadecimales'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  // Client ID del OAuth de Android (APK). Opcional: solo se necesita cuando el login viene del APK.
  GOOGLE_ANDROID_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  // Orígenes CORS separados por coma, ej: https://app.com,https://admin.app.com
  ALLOWED_ORIGINS: z.string().default(''),
  // Registro de cuentas nuevas. Cerrado por defecto durante el testing privado.
  // ponytail: string→bool explícito; z.coerce.boolean("false") daría true
  REGISTRATION_ENABLED: z.string().default('false').transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
