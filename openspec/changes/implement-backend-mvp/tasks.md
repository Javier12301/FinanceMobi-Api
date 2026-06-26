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

Pause after this checkpoint and report in Spanish.

## Checkpoint 4: Delegation Authorization

- [ ] 10. Implement roles, user delegations, and the approved active owner context mechanism.
- [ ] 11. Implement RBAC and ownership guards for wallet, transaction, and attachment resource IDs.
- [ ] 12. Add authorization tests covering owner, supervisor, advisor, revoked delegation, and guessed-ID/IDOR cases.

Pause after this checkpoint and report in Spanish.

## Checkpoint 5: Wallets, Categories, And Lookups

- [ ] 13. Implement wallet type and movement type seed data, plus category support according to resolved MVP scope.
- [ ] 14. Implement wallet list/create/update and safe delete handling according to the resolved wallet deletion policy.
- [ ] 15. Add wallet/category validation and authorization tests.

Pause after this checkpoint and report in Spanish.

## Checkpoint 6: Transaction Ledger

- [ ] 16. Implement income, expense, and transfer creation with positive decimal amounts and atomic wallet balance updates.
- [ ] 17. Implement wallet row locking for balance mutations and transaction filters for wallet, date range, and category.
- [ ] 18. Implement transaction edit/delete behavior only after policy resolution, including `TransactionHistory` full snapshots.

Pause after this checkpoint and report in Spanish.

## Checkpoint 7: Attachments And Google Drive

- [ ] 19. Implement Drive connection foundations with `drive.file` scope, root folder persistence, and encrypted refresh-token usage.
- [ ] 20. Implement attachment upload/list/delete behavior according to resolved file limits and Drive deletion policy.
- [ ] 21. Add tests for attachment authorization, Drive failure handling, and metadata persistence using mocks.

Pause after this checkpoint and report in Spanish.

## Checkpoint 8: Deployment Hardening

- [ ] 22. Complete Docker Compose health checks for MySQL, Redis, backend, frontend integration point, and proxy.
- [ ] 23. Add Nginx config that preserves `/api/*`, forwards real client headers, and supports frontend fallback routing.
- [ ] 24. Add `.env.example`, production exposure notes, and final verification commands.

Pause after this checkpoint and report in Spanish.
