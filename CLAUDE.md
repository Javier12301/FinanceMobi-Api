# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Regla de comunicación

Todos los mensajes, comentarios en código, reportes de checkpoint y preguntas dirigidas al usuario humano **deben estar en español**. El código, identificadores, tests y archivos OpenSpec pueden estar en inglés.

## Comandos esenciales

```bash
npm run dev          # servidor con hot-reload (tsx watch)
npm run build        # compila a dist/
npx tsc --noEmit     # type check sin emitir — ejecutar antes de cada pausa
npx vitest run       # todos los tests
npx vitest run src/features/auth/auth.test.ts   # un archivo específico
npm run db:migrate   # prisma migrate dev
npm run db:seed      # carga WalletType lookup data
docker compose up -d # levanta MySQL y Redis locales
```

## Modo de trabajo obligatorio

Este proyecto sigue **OpenSpec + TDD**. Antes de tocar código en cualquier checkpoint:

1. Leer `openspec/changes/implement-backend-mvp/test-plan.md` — define los tests mínimos requeridos.
2. Escribir los tests **primero** (deben fallar).
3. Implementar el mínimo para que pasen.
4. Correr `npx tsc --noEmit && npx vitest run` — ambos deben pasar.
5. Marcar tareas completadas en `openspec/changes/implement-backend-mvp/tasks.md`.
6. Reportar en español y **esperar aprobación** antes del siguiente checkpoint.

Los archivos de referencia en orden de lectura:
- `openspec/project.md` — reglas globales de arquitectura y seguridad
- `openspec/changes/implement-backend-mvp/proposal.md`
- `openspec/changes/implement-backend-mvp/design.md`
- `openspec/changes/implement-backend-mvp/tasks.md`
- `openspec/changes/implement-backend-mvp/test-plan.md`
- `openspec/specs/*/spec.md` — specs por dominio

## Arquitectura

```
src/
  app.ts           # Express app: middlewares globales + montaje de rutas
  server.ts        # bootstrap: connect Redis → app.listen → SIGTERM handler
  core/
    config/env.ts  # Zod parse de process.env, llama process.exit(1) si falla
    errors.ts      # AppError(statusCode, message) — importar desde aquí siempre
    database/
      prisma.ts    # singleton PrismaClient
      redis.ts     # singleton ioredis con lazyConnect:true
    middlewares/
      auth.ts      # verifica JWT firma + redis.exists(session:{userId}:{jti})
      validate.ts  # validate(zodSchema) → 400 si falla, sanitiza req.body
      errorHandler.ts  # último middleware; AppError → su código, resto → 500
    security/
      password.ts  # hashPassword / verifyPassword (bcryptjs, 12 rounds)
      jwt.ts       # signToken (jti=UUID), verifyToken, tokenTtlSeconds
      googleAuth.ts # verifyGoogleIdToken — lanza AppError(401) si falla
      encryption.ts # encrypt/decrypt AES-256-GCM; formato base64([IV12][tag16][cipher])
  features/
    auth/          # login, google SSO, logout, rate limiting
```

**Cadena de autorización** (a implementar en CP4):
`AuthMiddleware → RBAC/Context Middleware → OwnershipGuard → Controller`

**Sesiones Redis**: clave `session:{userId}:{jti}`, TTL = segundos de `JWT_EXPIRES_IN`.

**Cifrado refresh tokens**: `encrypt(token, env.ENCRYPTION_KEY)` antes de persistir en DB. `ENCRYPTION_KEY` = 64 chars hex (32 bytes).

## Variables de entorno requeridas

Ver `.env.example`. Las críticas para arrancar:
- `DATABASE_URL` — MySQL DSN
- `REDIS_URL` — Redis DSN
- `JWT_SECRET` — mínimo 32 caracteres
- `ENCRYPTION_KEY` — 64 chars hex (`openssl rand -hex 32`)
- `GOOGLE_CLIENT_ID` — OAuth client ID

## Tests

- Framework: **Vitest** con `vitest.config.ts` que inyecta env de test.
- Los mocks de `prisma` y `redis` van en cada archivo de test con `vi.mock(...)`.
- Para tests que usan `app` (supertest): mockear también `../features/auth/auth.ratelimit` como passthrough para evitar que `RedisStore` inicialice contra el mock.
- Los mocks de `verifyGoogleIdToken` deben lanzar `AppError(401)` al simular fallo (no `Error` genérico).

## Subagentes para implementación

Para implementar checkpoints usa el agente `claude` con modelo **Haiku** como implementador y el modelo principal (Sonnet) como orquestador de razonamiento:

```
Agent({
  description: "Implementar checkpoint N — <nombre>",
  model: "haiku",
  prompt: `
    Eres un implementador de backend TypeScript/Express para FinanceVier.
    Lee CLAUDE.md antes de empezar.
    
    Checkpoint a implementar: <N — nombre>
    Tareas: <lista de tareas del tasks.md>
    Tests requeridos: <lista del test-plan.md>
    
    Flujo obligatorio:
    1. Escribir tests fallidos primero
    2. Implementar mínimo para pasar
    3. Correr npx tsc --noEmit && npx vitest run
    4. Marcar tareas en tasks.md
    5. Reportar en español con el template de checkpoint
    
    Reglas de seguridad que nunca puedes omitir:
    - Nunca almacenar tokens en plaintext
    - Siempre usar transacciones Prisma para mutaciones de balance
    - Siempre verificar ownership además del rol
    - AppError para errores de dominio, 500 para inesperados
  `
})
```

El orquestador (Sonnet) revisa el reporte del subagente, valida contra las specs, y decide si aprobar o pedir correcciones antes del siguiente checkpoint.
