# Tasks

## Testing Rule

- Use TDD for each checkpoint: write or update the failing test first, then implement the smallest code that passes.
- Do not mark a task complete until relevant tests pass.
- Before every checkpoint pause, run `npx tsc --noEmit`, `npx vitest run`, and `openspec validate --all --strict --no-interactive`.
- Human-facing checkpoint reports must be in Spanish.

## Checkpoint 1: Registration And Profile

- [x] 1. Add tests for `POST /api/auth/register`: valid registration returns `{ token }`, duplicate email returns `409`, invalid body returns `400`, password is hashed, Redis session is created.
- [x] 2. Implement register schema, controller, service, and route using the existing auth rate limiter and session issuance.
- [x] 3. Create default categories for new credential users inside the same DB transaction as user creation.
- [x] 4. Add tests and implementation for `GET /api/me` returning `{ id, name, email, driveConnected }`.

Pause after this checkpoint and report in Spanish.

## Checkpoint 2: Delegation Management

- [x] 5. Add tests and implementation for `GET /api/delegations` returning `granted` and `managing` arrays in the frontend contract shape.
- [x] 6. Add tests and implementation for `POST /api/delegations`: existing user by email, role validation, self-delegation rejection, duplicate active delegation `409`, immediate active access.
- [x] 7. Add tests and implementation for `DELETE /api/delegations/:id`: owner-only revocation, `active=false`, `204`, and revoked access no longer enables `X-Owner-Id`.

Pause after this checkpoint and report in Spanish.

## Checkpoint 3: Attachment Upload And Delete

- [x] 8. Add route-level tests for multipart upload limits: max 3 files, max 5 MB per file, allowed MIME allowlist, unsupported MIME returns `400`.
- [x] 9. Implement multer memory upload with `upload.array('file', 3)`, `limits.fileSize`, `limits.files`, and MIME fileFilter.
- [x] 10. Implement attachment upload service: verify transaction ownership, require connected Drive, upload files to Drive with app properties, persist one DB row per uploaded file, avoid partial DB persistence on Drive failure.
- [x] 11. Add tests and implementation for `DELETE /api/transactions/:transactionId/attachments/:attachmentId`: verify ownership, delete Drive file first, then DB row, return `204`.

Pause after this checkpoint and report in Spanish.

## Checkpoint 4: Transaction Delete With Attachment Cleanup

- [x] 12. Add tests for `DELETE /api/transactions/:id`: income, expense, transfer balance reversal, history snapshot, attachment Drive cleanup, Drive failure leaves DB unchanged.
- [x] 13. Implement transaction delete: load transaction with attachments, delete Drive files first, then lock wallets and mutate DB inside Prisma transaction.
- [x] 14. Update Bruno collection and frontend contract docs if endpoint responses or upload field names changed.

Pause after this checkpoint and report in Spanish.

## Fixes post-implementación (aplicados por orquestador)

### CP1 — fixes

**F1 — GET /api/me montado en ruta incorrecta**
El subagente lo montó en `router.post('/me', ...)` dentro de `auth.routes.ts` → quedaba en `/api/auth/me`.
Fix: eliminado de `auth.routes.ts`, montado directamente en `app.ts` como `app.get('/api/me', authMiddleware, meController)`.

**F2 — Categorías default incorrectas**
El subagente usó nombres genéricos. Fix: hardcodeadas a: Comida, Transporte, Servicios, Ocio (EXPENSE), Sueldo (INCOME), Transferencia (TRANSFER).

**F3 — driveConnected demasiado permisivo**
`!!encryptedGoogleRefreshToken` solo. Fix: `!!encryptedGoogleRefreshToken && !!driveFolderId`.

**F4 — Register retornaba 201**
Fix: `res.json(result)` sin `.status(201)`.

**F5 — Race condition en register**
Faltaba catch de `P2002`. Fix: `try/catch` en la transacción con `if (err?.code === 'P2002') throw new AppError(409, ...)`.

### CP2 — fixes

**F6 — Reactivar delegación revocada violaba @@unique**
Crear otra fila cuando ya existía inactiva chocaba con el índice único `(ownerId, delegatedUserId)`.
Fix: si existe fila inactiva → `prisma.userDelegation.update({active:true, role})` en lugar de `create`.

**F7 — design.md decía requireOwnerContext para delegaciones**
Delegaciones no deben usar `X-Owner-Id` — operan sobre el usuario autenticado directamente.
Fix: actualizado design.md, rutas sin `requireOwnerContext`.

### CP3 — fixes

**F8 — uploadAttachment retornaba `{count}` en vez de array**
`createMany` no retorna filas en Prisma.
Fix: reemplazado por `Promise.all(uploaded.map(f => prisma.transactionAttachment.create(...)))`.

**F9 — SUPERVISOR usaba Drive incorrecto**
Controlador usaba `req.user.sub` para buscar el usuario del Drive → SUPERVISOR accedía a su propio Drive en lugar del del owner.
Fix: `req.ownerContext!.ownerId` en ambos handlers del controller de attachments.

### CP4 — fixes

**F10 — Hard delete bloqueado por FK RESTRICT**
`TransactionHistory` tiene FK ON DELETE RESTRICT apuntando a `Transaction`. El hard delete lanzaba error de DB.
Fix: soft delete — campo `deletedAt DateTime?` agregado al schema, migración `20260627151846_add_transaction_soft_delete` aplicada. `deleteTransaction` hace `transaction.update({deletedAt: new Date()})` en lugar de `transaction.delete()`.

**F11 — Transacciones soft-deleted operables**
`listTransactions` filtraba `deletedAt: null` pero todos los accesos directos por ID seguían usando `findUnique({id})` sin rechazar borradas.
Impacto: segundo DELETE revertía saldo otra vez; PUT podía modificar transacción borrada; attachments podían operar sobre transacción borrada.
Fix:
- `deleteTransaction` → `findFirst({id, deletedAt:null})` — segundo DELETE retorna 404 sin tocar wallets ni history
- `updateTransaction` → `tx.transaction.findFirst({id, deletedAt:null})` — rechaza antes de locks/balances
- `uploadAttachment` / `listAttachments` → `findFirst({id, deletedAt:null})`
- `deleteAttachment` → check `att.transaction.deletedAt !== null` → 404
- Tests añadidos: soft-deleted transaction retorna 404 en delete y update; todos los mocks `findUnique` de transaction migrados a `findFirst`.
