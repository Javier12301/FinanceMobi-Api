# Revision V3 CP1-CP4 - Fixes requeridos

## Estado de verificacion

- `npx tsc --noEmit`: OK.
- `npx vitest run`: OK, 13 suites / 134 tests.
- `openspec validate --all --strict --no-interactive`: OK, 9 items.
- `npm audit --omit=dev`: OK, 0 vulnerabilidades.
- Engram MCP: no disponible en esta sesion; la revision se hizo con diff local, OpenSpec y codigo.

Aunque la suite pasa, hay brechas de contrato, seguridad e idempotencia que deben corregirse antes de aprobar CP1-CP4 como cerrados.

## Hallazgos

### F1 - Bloqueante - Drive OAuth genera `state` pero no lo valida

**Archivo:** `src/features/attachments/attachments.service.ts:10`, `src/features/attachments/attachments.controller.ts:15`

`getAuthUrl()` genera un `state` y lo incluye en la URL, pero no lo persiste. `connectDriveHandler` solo acepta `code` y nunca recibe ni valida `state`. Esto incumple `design.md` y la tarea CP4.12, y deja el flujo OAuth sin proteccion CSRF/state.

**Fix esperado:**
- Persistir `state` por usuario en Redis con TTL corto, por ejemplo `drive_oauth_state:{userId}:{state}`.
- Hacer que `POST /api/drive/connect` exija `{ code, state }`.
- Validar y consumir el state antes de intercambiar el code.
- Agregar tests: state ausente, state invalido, state expirado/reusado y state valido.

### F2 - Bloqueante - `confirmRule` puede duplicar transacciones recurrentes

**Archivo:** `src/features/recurring/recurring.service.ts:114-149`

`confirmRule()` lee la regla, crea la transaccion y luego actualiza `nextRunDate` en operaciones separadas. Dos requests concurrentes pueden leer el mismo `nextRunDate`, crear dos transacciones y luego avanzar la regla una sola vez. Si `createTransaction()` OK pero el update de regla falla, el mismo vencimiento queda pendiente y se puede materializar de nuevo.

**Fix esperado:**
- Hacer la confirmacion idempotente con bloqueo/marker durable por ocurrencia.
- Opcion recomendada: agregar una tabla de ocurrencias/materializaciones con unique `(recurringRuleId, dueDate)` y crear ese marker en la misma unidad logica antes de crear la transaccion.
- Refactorizar el ledger para permitir crear la transaccion dentro de una transaccion Prisma controlada, o garantizar compensacion si el avance de regla falla.
- Agregar tests de doble confirmacion y fallo entre create transaction/update rule.

### F3 - Alto - `autoPost=true` queda sin procesamiento

**Archivo:** `src/features/recurring/recurring.service.ts:95-105`, `src/features/recurring/recurring.service.ts:108-152`

El contrato V3 indica que `autoPost=true` debe insertar sin confirmacion. La implementacion filtra pendientes con `autoPost: false` y no hay ningun flujo lazy/cron que materialice reglas `autoPost=true`. Resultado: una regla auto-post vencida no aparece como pendiente ni crea transaccion.

**Fix esperado:**
- Implementar materializacion lazy segura para reglas `active=true`, `autoPost=true`, `nextRunDate <= now`.
- Reutilizar el mismo mecanismo idempotente de F2.
- Definir en que lectura se dispara; para este backend puede ser `GET /api/recurring-rules/pending` o un helper invocado por dashboard/login si existe.
- Agregar tests para regla autoPost vencida, no vencida, pausada y reintento idempotente.

### F4 - Alto - Flujo Drive conecta el usuario autenticado, no necesariamente el owner activo

**Archivo:** `src/features/attachments/attachments.routes.ts:24-25`, `src/features/attachments/attachments.controller.ts:17`

Las rutas Drive usan `requireOwnerContext`, pero `connectDrive()` actualiza `req.user!.sub`. Si un delegado llama el endpoint con `X-Owner-Id` de un owner, el backend valida el contexto del owner pero conecta el Drive del delegado. Los adjuntos usan el Drive del owner, por lo que la UI puede quedar en un estado incoherente.

**Fix esperado:**
- Decidir contrato: conectar Drive solo para el usuario autenticado sin `X-Owner-Id`, o permitir solo cuando `req.user.sub === req.ownerContext.ownerId`.
- Para almacenamiento BYO del owner, rechazar delegados con 403 en `/api/drive/auth-url` y `/api/drive/connect`.
- Agregar tests OWNER OK, SUPERVISOR/ASESOR delegados 403.

### F5 - Medio - `POST /api/categories` no acepta `null` para `icon`/`color`

**Archivo:** `src/features/wallets/wallets.schema.ts:19-24`

El contrato frontend dice que `POST /api/categories` y `PUT` aceptan `icon`/`color` opcionales y que si llegan `null` la UI usa fallback. `updateCategorySchema` acepta `null`, pero `createCategorySchema` solo acepta `undefined`.

**Fix esperado:**
- Cambiar create schema a `icon: iconEnum.nullable().optional()` y `color: z.string().regex(...).nullable().optional()`.
- Persistir `null` explicitamente o normalizar `undefined`/`null` de forma consistente.
- Agregar test de `POST /api/categories` con `{ icon: null, color: null }`.

### F6 - Medio - Delete de categoria puede terminar en 500 por FK de budgets/recurring rules

**Archivo:** `src/features/wallets/categories.service.ts:38-46`

`deleteCategory()` solo cuenta transacciones. Si no hay transacciones pero si hay `Budget` o `RecurringRule` referenciando la categoria, `prisma.category.delete()` puede fallar por FK y devolver error interno en vez de una politica clara.

**Fix esperado:**
- Prechequear referencias en `Budget` y `RecurringRule`.
- Devolver `409` con mensaje claro si la categoria esta en uso por presupuestos o reglas recurrentes.
- Agregar tests para ambas referencias.

### F7 - Medio - Validacion incompleta de consistencia en reglas recurrentes

**Archivo:** `src/features/recurring/recurring.service.ts:31-44`

La creacion valida ownership de wallet/categoria, pero no valida que `category.movementType` coincida con `input.movementType`. Tampoco rechaza `destinationWalletId` cuando el movimiento no es `TRANSFER`, aunque el contrato dice que ese campo es solo para transferencias.

**Fix esperado:**
- Si `category.movementType !== input.movementType`, retornar 400.
- Si `movementType !== 'TRANSFER'` y llega `destinationWalletId`, retornar 400 o normalizarlo a `null` de forma documentada.
- Agregar tests para categoria de tipo incorrecto y destination en INCOME/EXPENSE.

### F8 - Medio - Calculo de fechas recurrentes con dia 29-31 puede desbordar meses

**Archivo:** `src/features/recurring/recurring.service.ts:11-15`, `src/features/recurring/recurring.service.ts:143-144`

`Date.setDate(31)` y `setMonth(+1)` usan normalizacion de JavaScript. En meses cortos pueden producir fechas como marzo 2/3 en lugar de ultimo dia valido del mes o el siguiente dia 31. Esto afecta reglas con `dayOfMonth` 29, 30 o 31.

**Fix esperado:**
- Definir politica: clamp al ultimo dia del mes o saltar al proximo mes que tenga ese dia.
- Implementar helper deterministico para `nextRunDate`.
- Agregar tests para febrero, meses de 30 dias y cambio de anio.

## Tests adicionales requeridos

- Tests de ruta o integracion para RBAC de budgets, recurring y drive, no solo servicios.
- Tests de serializacion de Decimal en respuestas si el frontend espera decimal-string.
- Test de migracion/Prisma para nombres de migracion descriptivos y aplicables en DB limpia.

## Notas no bloqueantes

- Las migraciones nuevas `20260628002824_f` y `20260628005014_` funcionan, pero los nombres no describen la intencion. Para historial mantenible, futuras migraciones deben usar nombres como `add_category_metadata` y `add_budgets_recurring_rules`.
- `npm audit --omit=dev` inicialmente fallo por red del sandbox; reintentado con acceso aprobado y resultado 0 vulnerabilidades.
