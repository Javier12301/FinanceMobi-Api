# Tasks

## Testing Rule

- Before each new checkpoint, read `test-plan.md` for the required tests.
- Use TDD for checkpoint work: write or update the failing test first, implement the smallest code that passes, then refactor only if needed.
- A task is not complete until its relevant tests pass.
- Before every checkpoint pause, run `npx tsc --noEmit` and `npx vitest run`.
- Manual API QA with Bruno starts as smoke testing at Checkpoint 2 and becomes required at Checkpoint 4.

## Checkpoint 1: Project Foundation ✅ Revisado y aprobado

- [x] 1. Initialize the TypeScript Express backend project with package scripts, `tsconfig`, lint/format/test basics, `src/app.ts`, `src/server.ts`, and `GET /api/health`.
- [x] 2. Add environment parsing, centralized error handling, request logging, and Zod validation middleware.
- [x] 3. Add Prisma, MySQL connection, Redis connection, initial schema draft, seed structure, and local Docker Compose foundations.

### Fixes post-checkpoint 1
- Reemplazado `bcrypt` → `bcryptjs` (elimina binarios nativos y cadena vulnerable `@mapbox/node-pre-gyp` → `tar`).
- Eliminada `google-auth-library@^9` como dependencia directa (ya viene transitivamente vía `googleapis@173` como `@10.x`, sin vulnerabilidades).
- Resultado: `npm audit` → 0 vulnerabilidades, 51 paquetes eliminados.

Pause after this checkpoint and report in Spanish.

## Checkpoint 2: Authentication And Sessions ✅ Revisado y aprobado

- [x] 4. Implement credential authentication with bcrypt password hashing/verification and safe login errors.
- [x] 5. Implement JWT issuance with `jti`, Redis `session:{userId}:{jti}` storage, auth middleware, and single-session logout.
- [x] 6. Implement Redis-backed rate limiting for auth endpoints and add focused auth/session tests.

### Fixes post-checkpoint 2 (revisión de seguridad)
- **[bloqueante]** Hash dummy inválido → reemplazado por `DUMMY_HASH = bcrypt.hashSync('__dummy__', 12)` precomputado al arrancar en `password.ts`. Garantiza tiempo constante real en `verifyPassword()` cuando el usuario no existe. Test agregado que verifica formato `$2a$12$...` del hash usado.
- **[retroalimentación tests]** Agregados tests de regresión CP1/CP2 faltantes: `core.test.ts` (health, validate, errorHandler) y `auth.middleware.test.ts` (token ausente, inválido, revocado, válido, clave Redis correcta).

Pause after this checkpoint and report in Spanish.

## Checkpoint 3: Google SSO And Token Security ✅ Revisado y aprobado

- [x] 7. Implement Google `id_token` verification flow that identifies or creates users and issues system JWT sessions.
- [x] 8. Implement AES-256-GCM helpers for Google refresh-token encryption/decryption and ensure plaintext tokens are never logged or persisted.
- [x] 9. Add tests for Google login boundaries and encrypted token persistence behavior using mocks.

### Fixes post-checkpoint 3 (revisión de seguridad)
- **[bloqueante]** `email_verified` no validado → `googleAuth.ts` ahora rechaza payload si `email_verified !== true`. Evita matching por email con cuentas existentes usando un email Google sin confirmar. Test agregado.
- **[bloqueante]** `google-auth-library` re-agregada como dep directa `@10.x` — TypeScript no resuelve tipos de deps transitivas aunque estén en `node_modules`.
- **[medio]** `ENCRYPTION_KEY` solo validaba longitud → cambiado a `.regex(/^[0-9a-fA-F]{64}$/)`. Clave no-hex ahora falla en startup, no en tiempo de cifrado.
- Mock de `password` en `auth.test.ts` actualizado para exportar `DUMMY_HASH` con formato bcrypt válido.

### Mejoras post-pruebas manuales (seed configurable)
- [x] `prisma/seed.ts` lee `SEED_ADMIN_*` y `SEED_GOOGLE_USER_*` desde `process.env` con defaults. Sin emails hardcodeados.
- [x] `.env.example` actualizado con variables de seed documentadas.

Pause after this checkpoint and report in Spanish.

## Checkpoint 4: Delegation Authorization ✅ Revisado y aprobado

- [x] 10. Implement roles, user delegations, and the approved active owner context mechanism.
- [x] 11. Implement RBAC and ownership guards for wallet, transaction, and attachment resource IDs.
- [x] 12. Add authorization tests covering owner, supervisor, advisor, revoked delegation, and guessed-ID/IDOR cases.

### Archivos creados (CP4)
- `src/core/middlewares/ownerContext.ts` — lee `X-Owner-Id`, valida UUID, busca `UserDelegation.active`, setea `req.ownerContext`
- `src/core/middlewares/rbac.ts` — `requireRole(...roles)`, bloquea ASESOR en mutaciones
- `src/core/middlewares/ownershipGuard.ts` — verifica `resource.ownerId === req.ownerContext.ownerId`
- `src/core/types/express.d.ts` — augmentación única de `Express.Request` con `user` y `ownerContext`
- `src/features/auth/delegation.test.ts` — 9 tests unitarios

### Fixes post-revisión (CP4)
- Augmentación `Express.Request` consolidada en `express.d.ts`; eliminado `declare global` duplicado de `auth.ts`.

Pause after this checkpoint and report in Spanish.

## Checkpoint 5: Wallets, Categories, And Lookups ✅ Revisado y aprobado

- [x] 13. Implement wallet type and movement type seed data, plus category support according to resolved MVP scope.
- [x] 14. Implement wallet list/create/update and safe delete handling according to the resolved wallet deletion policy.
- [x] 15. Add wallet/category validation and authorization tests.

### Archivos creados (CP5)
- `src/features/wallets/wallets.schema.ts` — schemas Zod únicos y tipos inferidos
- `src/features/wallets/wallets.service.ts` — create/list/update/delete (409 si tiene transacciones)
- `src/features/wallets/wallets.controller.ts` — adaptadores Request→service
- `src/features/wallets/wallets.routes.ts` — cadena completa de middlewares por endpoint
- `src/features/wallets/categories.service.ts` — createCategory, listCategories
- `src/features/wallets/categories.controller.ts` — adaptadores + listWalletTypes
- `src/features/wallets/categories.routes.ts` — `/api/categories` (auth) y `/api/wallet-types` (público)
- `src/features/wallets/wallets.test.ts` + `categories.test.ts` — 8 tests de servicio

### Fixes post-revisión (CP5)
- Schema Zod único en `wallets.schema.ts`; eliminada duplicación entre service y route.
- `deleteWallet(walletId)` simplificado; ownership ya cubierto por el guard en el middleware.
- Eliminados 6 tests superficiales que describían comportamiento de middleware pero llamaban el service directamente.
- CLAUDE.md actualizado: subagentes Haiku arrancan con skill ponytail para prevenir sobreingeniería.

Pause after this checkpoint and report in Spanish.

## Checkpoint 6: Transaction Ledger ✅ Revisado y aprobado

- [x] 16. Implement income, expense, and transfer creation with positive decimal amounts and atomic wallet balance updates.
- [x] 17. Implement wallet row locking for balance mutations and transaction filters for wallet, date range, and category.
- [x] 18. Implement transaction edit/delete behavior only after policy resolution, including `TransactionHistory` full snapshots.

### Archivos creados (CP6)
- `src/features/transactions/transactions.schema.ts` — schemas Zod únicos para create/update/list
- `src/features/transactions/transactions.service.ts` — createTransaction (INCOME/EXPENSE/TRANSFER con row lock), listTransactions (filtros por wallet/category/date), updateTransaction (crea history snapshots), deleteTransaction (501 stub)
- `src/features/transactions/transactions.controller.ts` — adaptadores Request → service
- `src/features/transactions/transactions.routes.ts` — cadena de middlewares: auth → ownerContext → requireRole → controller
- `src/features/transactions/transactions.test.ts` — 10 tests cobriendo: monto positivo, INCOME/EXPENSE/TRANSFER, rollback, filtros, history snapshots, delete stub

### Mejoras de implementación (CP6)
- Transacción Prisma usa `$transaction(async tx => {...})` con `$queryRaw SELECT ... FOR UPDATE` para row lock en MySQL.
- Balance calculation respeta `toNumber()` en Decimal fields de Prisma.
- Filtros de lista previenen IDOR: busca wallets del owner, luego filtra transacciones dentro de esos wallets.
- updateTransaction recalcula balance revirtiendo cambio anterior y aplicando el nuevo.
- Ownership verificado en el servicio (no `ownershipGuard` directo) porque Transaction no tiene `ownerId`.

### Fixes post-revisión (CP6)
- **[bloqueante — IDOR]** `listTransactions` con `filters.walletId` externo podía devolver transacciones de otro owner. Fix: verificar que `walletId` pertenece al owner antes de usarlo; retornar `[]` si no está en su scope.
- **[bloqueante — atomicidad]** `$queryRaw SELECT ... FOR UPDATE` en `createTransaction` usaba `prisma` global en lugar del cliente `tx` de la transacción. Fix: `(tx as any).$queryRaw\`...\`` para garantizar misma conexión/transacción.
- **[bloqueante — atomicidad]** `updateTransaction` también usaba `(prisma as any).$queryRaw` fuera del contexto `tx`. Fix: mismo patrón `(tx as any).$queryRaw`.
- **[medio — correctitud]** TRANSFER update solo ajustaba wallet origen; no revertía/aplicaba cambio en wallet destino. Fix: lock y actualización de `destinationWalletId` dentro de la misma transacción Prisma.
- **[medio — seguridad]** `updateTransaction` aceptaba `categoryId` nuevo sin verificar ownership. Fix: cargar categoría dentro de `tx`, verificar `cat.ownerId === ownerContext.ownerId`.
- **[test]** Assertion de `filtra por walletId` actualizada: espera `{ walletId: { in: ['wallet-1'] } }` (refleja el fix IDOR).

Pause after this checkpoint and report in Spanish.

## Checkpoint 7: Attachments And Google Drive ✅ Revisado y aprobado

- [x] 19. Implement Drive connection foundations with `drive.file` scope, root folder persistence, and encrypted refresh-token usage.
- [x] 20. Implement attachment upload/list/delete behavior according to resolved file limits and Drive deletion policy.
- [x] 21. Add tests for attachment authorization, Drive failure handling, and metadata persistence using mocks.

### Archivos creados (CP7)
- `src/features/attachments/attachments.service.ts` — connectDrive (cifra token, crea carpeta), uploadAttachment (501 stub — política pendiente), listAttachments (verifica ownership), deleteAttachment (501 stub)
- `src/features/attachments/attachments.controller.ts` — adaptadores Request → service; uploadAttachmentHandler llama next(AppError(501)) directamente
- `src/features/attachments/attachments.routes.ts` — cadena de middlewares: auth → ownerContext → requireRole → controller (sin multer hasta política aprobada)
- `src/core/security/driveClient.ts` — factory getDriveClient(encryptedToken) con OAuth2 setup
- `src/features/attachments/attachments.test.ts` — 8 tests: encrypt/plaintext, Upload retorna 501 (política), MIME rejection (501), size limit rejection (501), Drive failure isolation, list authorization, delete stub (501)

### Mejoras de implementación (CP7)
- Refresh token cifrado con AES-256-GCM antes de persistir en `User.encryptedGoogleRefreshToken`.
- Drive client factory descifra el token al crear cliente OAuth2.
- Se agregó `GOOGLE_CLIENT_SECRET` a `env.ts`, `.env.example` y `vitest.config.ts`.

### Fixes post-revisión (CP7)
- **[bloqueante — seguridad]** Upload aceptaba archivos a pesar de tener política de MIME/tamaño sin resolver. Fix (Option A): `uploadAttachment` lanza `AppError(501)` inmediatamente sin procesar el archivo. Todo el código de validación/Drive fue eliminado como dead code.
- **[bloqueante — seguridad]** Multer sin límite de tamaño configurado podía consumir memoria arbitraria. Fix: multer removido por completo de `attachments.routes.ts` hasta que la política sea aprobada.
- **[bloqueante — correctitud]** `attachments.controller.ts` tenía `if (!req.file) throw new Error('No file provided')` → generaba HTTP 500 en lugar del 501 esperado. Fix: `uploadAttachmentHandler` ahora llama `next(new AppError(501, ...))` directamente sin inspeccionar `req.file`.
- **[test]** Test `llama Drive API` actualizado para esperar rechazo con `statusCode: 501` (refleja política bloqueada).

Pause after this checkpoint and report in Spanish.

## Checkpoint 8: Deployment Hardening

- [x] 22. Complete Docker Compose health checks for MySQL, Redis, backend, frontend integration point, and proxy.
- [x] 23. Add Nginx config that preserves `/api/*`, forwards real client headers, and supports frontend fallback routing.
- [x] 24. Add `.env.example`, production exposure notes, and final verification commands.

### Archivos creados (CP8)
- `Dockerfile` — build multistage Node 22: compila TS, copia solo artefactos de prod, corre `prisma migrate deploy` al arrancar
- `docker-compose.prod.yml` — stack completo con health checks; MySQL y Redis sin puertos expuestos al host; backend con healthcheck en `/api/health`; Nginx sirve frontend desde `./frontend/dist`
- `nginx.conf` — proxy `/api/*` → `backend:3000` con headers reales (`X-Forwarded-For`, `X-Real-IP`); fallback SPA (`try_files`) para rutas del cliente
- `README.md` — guía de dev local + guía de deploy VPS paso a paso (variables críticas, build de frontend, SSL con Certbot)

### Nota de integración
- `docker-compose.yml` original queda intacto para desarrollo local (sin cambios)
- CORS configurable vía `ALLOWED_ORIGINS` en `.env` (agregado junto a CP8)
- Frontend build debe copiarse a `./frontend/dist/` antes de levantar el compose de prod

Pause after this checkpoint and report in Spanish.
