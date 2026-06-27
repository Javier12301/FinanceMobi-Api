# Fixes requeridos — unblock-frontend-ui-v2 CP3 + CP4

Estado de verificación:

- `npx tsc --noEmit`: OK
- `npx vitest run`: 98/98 OK
- `openspec validate --all --strict --no-interactive`: OK

La suite pasa, pero CP3+CP4 no quedan aprobados para QA manual todavía. Hay bloqueantes de comportamiento real que los tests actuales no cubren.

## 1. CP4 no puede borrar transacciones con historial por FK

Severidad: bloqueante

Ubicación:

- `src/features/transactions/transactions.service.ts:255-268`
- `prisma/schema.prisma:127-137`
- `prisma/migrations/20260626223836_financev1/migration.sql:132-133`

Problema:

`deleteTransaction` crea `TransactionHistory` con `transactionId = transaction.id` y después intenta borrar la transacción. La FK real es `ON DELETE RESTRICT`, así que MySQL va a impedir borrar la fila padre mientras exista historial apuntando a ella. Además, cualquier transacción que ya tenga historial de CREATE/UPDATE también queda bloqueada.

Fix mínimo recomendado:

- No hacer hard delete de `Transaction` mientras `TransactionHistory.transactionId` sea requerido y restrictivo.
- Para V2, implementar soft delete en `Transaction` (`deletedAt` o `deleted Boolean`) y filtrar listados, o cambiar el modelo/migración para permitir historial huérfano de forma explícita.
- Si se cambia schema, agregar migración y test que falle con el caso real: transacción con historial existente + DELETE.

No basta con cambiar el test mockeado; el contrato DB actual es el que bloquea.

## 2. CP3 upload/delete usa `req.user.sub` y rompe delegados SUPERVISOR

Severidad: bloqueante

Ubicación:

- `src/features/attachments/attachments.controller.ts:17-20`
- `src/features/attachments/attachments.controller.ts:36-40`
- `src/features/attachments/attachments.service.ts:45-61`
- `src/features/attachments/attachments.service.ts:113-130`

Problema:

Las rutas exigen `requireOwnerContext` y `requireRole('OWNER', 'SUPERVISOR')`, por lo que un delegado `SUPERVISOR` debe poder operar sobre `X-Owner-Id`. El controller pasa `req.user.sub` como owner; para delegados eso es el user delegado, no el owner real. Resultado: ownership falla o se busca Drive en el usuario equivocado.

Fix mínimo recomendado:

- En upload/delete, pasar `req.ownerContext!.ownerId` al service para ownership y Drive del owner.
- Mantener `req.user!.sub` solo si hace falta auditar quién ejecutó la acción.
- Agregar tests de controller/ruta o service que cubran `req.user.sub !== req.ownerContext.ownerId` con rol `SUPERVISOR`.

## 3. CP3 upload devuelve `{ count }`, no attachments creados

Severidad: bloqueante para frontend/Bruno

Ubicación:

- `src/features/attachments/attachments.service.ts:89-96`
- `src/features/attachments/attachments.controller.ts:19-20`
- `bruno/financevier-backend/06-attachments/Upload Attachment.bru:22-31`

Problema:

El service usa `createMany`, que devuelve `{ count }`. Bruno y QA esperan un array con los adjuntos creados para capturar `attachmentId` (`res.body[0].id`). Con la respuesta actual, el post-response no puede guardar `attachmentId`.

Fix mínimo recomendado:

- Reemplazar `createMany` por `Promise.all(uploaded.map(...create...))` y devolver el array de rows creadas.
- Mantener la regla actual: persistir DB solo después de que todos los uploads Drive hayan terminado OK.
- Agregar test que espere `result[0].id` y que el JSON de `POST /attachments` sea**s** array.

## 4. CP4 puede borrar DB y dejar archivos huérfanos si falta token Drive

Severidad: alta

Ubicación:

- `src/features/transactions/transactions.service.ts:207-216`

Problema:

Si la transacción tiene attachments pero el owner no tiene `encryptedGoogleRefreshToken`, el código salta el borrado de Drive y sigue con la transacción Prisma, borrando filas DB. Eso contradice el contrato: Drive primero; si no se puede borrar Drive, no tocar DB.

Fix mínimo recomendado:

- Si `transaction.attachments.length > 0`, exigir `encryptedGoogleRefreshToken` y `driveFolderId`; si falta algo, lanzar error antes de `prisma.$transaction`.
- Agregar test: transacción con attachments + owner sin Drive conectado => error y `prisma.$transaction` no se llama.

## 5. Falta actualizar contrato frontend real

Severidad: media

Ubicación:

- `docs/para-front/contrato-frontend-v1.md:543-590`
- `docs/para-front/contrato-frontend-v1.md:721-726`

Problema:

Bruno fue actualizado, pero el contrato frontend sigue diciendo que upload/delete attachments y delete transaction son stub `501`.

Fix mínimo recomendado:

- Actualizar `docs/para-front/contrato-frontend-v1.md` con endpoints activos, límites MIME/tamaño y respuesta real de upload.
- Actualizar tabla de estado: `POST /attachments`, `DELETE /attachments/:attachmentId`, `DELETE /transactions/:transactionId` como disponibles solo después de resolver los bloqueantes anteriores.

## 6. Tests CP3 no son route-level para multer

Severidad: media

Ubicación:

- `src/features/attachments/attachments.test.ts`
- `openspec/changes/unblock-frontend-ui-v2/tasks.md:29-30`

Problema:

La tarea 8 pide tests route-level para límites multipart. El archivo actual testea service, no prueba `upload.array('file', 3)`, `limits.fileSize`, `limits.files` ni `fileFilter` vía Express/supertest.

Fix mínimo recomendado:

- Agregar tests mínimos de ruta para:
  - MIME inválido => 400
  - más de 3 archivos => 400
  - archivo > 5 MB => 400
- Mantener mocks de auth/owner/rbac para que el test apunte al middleware multer y controller.

## Orden recomendado

1. Resolver modelo de delete de transacción vs historial FK.
2. Corregir owner context en attachments.
3. Corregir respuesta de upload a array de attachments.
4. Corregir cleanup Drive en delete transaction cuando falta conexión.
5. Agregar tests faltantes.
6. Actualizar contrato frontend.

Después de aplicar fixes, correr:

```bash
npx tsc --noEmit
npx vitest run
openspec validate --all --strict --no-interactive
```
