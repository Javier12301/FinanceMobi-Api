# Follow-up requerido — unblock-frontend-ui-v2 CP3 + CP4

Estado de verificación:

- `npx tsc --noEmit`: OK
- `npx vitest run`: 98/98 OK
- `openspec validate --all --strict --no-interactive`: OK

Los fixes previos están aplicados, pero el cambio a soft delete dejó un bloqueante nuevo. No aprobar QA manual todavía.

## 1. Soft delete permite operar transacciones ya borradas

Severidad: bloqueante

Ubicación:

- `src/features/transactions/transactions.service.ts:116-183`
- `src/features/transactions/transactions.service.ts:191-250`
- `src/features/attachments/attachments.service.ts:51-56`
- `src/features/attachments/attachments.service.ts:99-104`
- `src/features/attachments/attachments.service.ts:117-123`

Problema:

`Transaction.deletedAt` existe y `listTransactions` filtra `deletedAt: null`, pero los accesos directos por ID siguen usando `findUnique({ where: { id } })` sin rechazar transacciones soft-deleted.

Impacto real:

- Si se llama `DELETE /api/transactions/:id` dos veces, la segunda llamada encuentra la misma transacción soft-deleted y revierte el saldo otra vez.
- `PUT /api/transactions/:id` puede modificar una transacción borrada y tocar balances otra vez.
- `POST/GET/DELETE /api/transactions/:transactionId/attachments...` puede operar sobre una transacción borrada si el cliente conserva el ID.

Fix mínimo recomendado:

- En `deleteTransaction`, si la transacción existe pero `deletedAt !== null`, responder `404` o `204` idempotente sin tocar balances. Elegir una opción y testear que no llama `wallet.update` ni crea otro history.
- En `updateTransaction`, rechazar `oldTx.deletedAt !== null` antes de locks/balances.
- En `uploadAttachment`, `listAttachments` y `deleteAttachment`, rechazar si `transaction.deletedAt !== null`.
- Donde sea más corto, cambiar `findUnique` por `findFirst({ where: { id, deletedAt: null }, include: ... })`.

Tests mínimos:

- `deleteTransaction` con `{ deletedAt: new Date() }` no revierte saldo ni crea history.
- `updateTransaction` con `{ deletedAt: new Date() }` rechaza antes de mutar wallet.
- `uploadAttachment` con transacción soft-deleted rechaza antes de subir a Drive.

Después de aplicar:

```bash
npx tsc --noEmit
npx vitest run
openspec validate --all --strict --no-interactive
```
