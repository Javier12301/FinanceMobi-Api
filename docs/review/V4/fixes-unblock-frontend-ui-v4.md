# Fixes requeridos - unblock-frontend-ui-v4

## Estado de la revision

La implementacion reporta 20/20 tareas y las verificaciones base pasan:

- `npx tsc --noEmit`: OK
- `npx vitest run`: OK, 17 suites / 172 tests
- `openspec validate --all --strict --no-interactive`: OK, 12/12
- `npm audit --omit=dev`: OK, 0 vulnerabilidades

No se aprueba QA manual todavia. Hay bloqueantes de autorizacion, consistencia financiera y contrato V4 no cubiertos por tests.

## F1 - Bloqueante - `/api/debts` permite mutaciones a `ASESOR`

**Archivo:** `src/features/debts/debts.routes.ts:15-21`

Las rutas de deudas aplican `authMiddleware` y `requireOwnerContext`, pero no `requireRole('OWNER', 'SUPERVISOR')`. Un delegado `ASESOR` podria crear, editar, borrar o pagar deudas del owner activo, violando el patron V3/V4 de recursos owner-scoped.

**Fix esperado:** agregar `requireRole('OWNER', 'SUPERVISOR')` a `POST`, `PUT`, `DELETE` y `POST /:id/pay`. `GET /api/debts` puede seguir siendo legible para roles con acceso de lectura si ese es el patron actual.

**Tests requeridos:** cubrir que `ASESOR` recibe 403 en create/update/delete/pay y que `SUPERVISOR` sigue pudiendo mutar.

## F2 - Bloqueante - `createTransactionInTx` lee balances antes de bloquear wallets

**Archivo:** `src/features/transactions/transactions.service.ts:18-50`

El helper nuevo lee `wallet.currentBalance` antes de ejecutar `SELECT ... FOR UPDATE`. Dos writes concurrentes pueden leer el mismo saldo y sobrescribirse. Ademas, en `TRANSFER` lee la wallet destino antes de bloquearla y toma locks en orden source->dest, lo que reintroduce riesgo de deadlock si dos transferencias cruzadas corren al mismo tiempo.

Esto afecta tanto altas manuales como `POST /api/debts/:id/pay`, porque `createTransaction()` ahora delega en ese helper.

**Fix esperado:** dentro de la transaccion, bloquear primero todas las wallets afectadas y recien despues leer balances. Para transferencias, bloquear source/destination en orden deterministico por id, rechazar `walletId === destinationWalletId`, y luego calcular balances con lecturas posteriores al lock.

**Tests requeridos:** unit/integration para orden de locks, `walletId === destinationWalletId` en transfer, y caso concurrente que demuestre que dos creates sobre la misma wallet conservan ambos movimientos.

## F3 - Bloqueante - Filtros V4 de transacciones no cumplen contrato y pueden fallar en runtime

**Archivos:** `src/features/transactions/transactions.routes.ts:25`, `src/features/transactions/transactions.controller.ts:16`, `src/features/transactions/transactions.service.ts:106-118`

La ruta `GET /api/transactions` no usa `validate(listTransactionFiltersSchema)`. `req.query` se castea a TypeScript, pero en runtime `page` y `pageSize` siguen siendo strings; Prisma puede recibir `take: "10"` y fallar. Ademas, el contrato V4 aclarado exige envelope `{ items, total, page, pageSize }` cuando existe cualquier query param. Hoy solo devuelve envelope si vienen `page` o `pageSize`; `?q=cafe`, `?type=EXPENSE` o `?from=...` devuelven array plano.

**Fix esperado:** validar/coercear query params antes del controller. Detectar presencia de cualquier query param para activar respuesta V4. Sin query params, preservar array plano V3.

**Tests requeridos:** endpoint tests para `?q=`, `?type=`, `?from/to`, `?page/pageSize`, query invalida y wallet no autorizada con envelope.

## F4 - Alto - `createDebt` acepta `categoryId` de otro owner

**Archivo:** `src/features/debts/debts.service.ts:30-44`

Al crear una deuda, `categoryId` se persiste sin verificar que la categoria exista y pertenezca al owner activo. Una categoria valida de otro owner pasa la FK y queda asociada a la deuda. Luego el pago falla en `createTransactionInTx`, pero el dato corrupto ya quedo guardado.

**Fix esperado:** si `categoryId` viene en el body, buscar la categoria por id y `ownerId`; si no existe o pertenece a otro owner, devolver 404 antes de crear la deuda.

**Tests requeridos:** crear deuda con categoria de otro owner debe fallar y no llamar `prisma.debt.create`.

## F5 - Alto - `payDebt` permite sobrepago y crea una transaccion por monto incorrecto

**Archivo:** `src/features/debts/debts.service.ts:92-126`

Si `remaining = 100` y el cliente envia `amount = 1000`, el servicio crea una transaccion por 1000 y luego clampa `remaining` a 0. Eso puede mover dinero de mas y marcar la deuda como pagada.

**Fix esperado:** rechazar `amount > remaining` con 400/409, o definir explicitamente una regla de pago parcial/final que nunca cree una transaccion por encima del saldo pendiente. Para V4, la opcion segura es rechazar sobrepago.

**Tests requeridos:** sobrepago debe fallar sin crear transaccion, sin mutar wallet y sin actualizar deuda.

## F6 - Alto - Candidatos de notificacion incompletos e ignoran preferencias

**Archivo:** `src/features/notifications/notifications.service.ts:38-71`

OpenSpec V4 pide candidatos para daily reminder, recurrentes vencidas, budgets al 80/100 y streak risk. La implementacion solo calcula daily y recurring. Ademas, las recurrentes vencidas se notifican sin verificar `recurringAlerts`; cualquier usuario con device token y regla vencida puede recibir candidato aunque haya desactivado alertas.

**Fix esperado:** implementar candidatos de budget thresholds y streak risk, y respetar `budgetAlerts`/`recurringAlerts`. Si no existe `NotificationPreference`, usar defaults de V4 de forma consistente.

**Tests requeridos:** casos para budget 80/100, streak risk, `recurringAlerts=false`, `budgetAlerts=false` y usuario sin prefs.

## F7 - Medio - `POST /api/me/devices` no devuelve el device record

**Archivo:** `src/features/notifications/notifications.controller.ts:4-8`

La spec indica que `POST /api/me/devices` debe devolver el dispositivo almacenado. El controller descarta el resultado de `registerDevice` y responde `{ ok: true }`, rompiendo contrato para un frontend que quiera reconciliar id/platform/token.

**Fix esperado:** responder `201` con el registro devuelto por `registerDevice`, idealmente serializado a los campos necesarios.

**Tests requeridos:** endpoint/controller test que verifique respuesta con `id`, `userId`, `token`, `platform`, `createdAt`.

## F8 - Medio - IDs nuevos usan `uuid()` contra la aclaracion V4 de `cuid()`

**Archivo:** `prisma/schema.prisma`

La aclaracion previa al implementador dejo definido mantener `String @id @default(cuid())` salvo convencion local distinta. Los modelos nuevos `Debt`, `NotificationDevice` y `NotificationPreference` usan `uuid()`. No es una falla funcional inmediata, pero deja inconsistencia de convencion y contradice el contrato de implementacion acordado.

**Fix esperado:** decidir una convencion unica. Si el repo ya usa `uuid()` mayoritariamente, documentar la desviacion en OpenSpec/QA. Si no, cambiar modelos y migraciones antes de aplicar en ambientes persistentes.

## Observaciones no bloqueantes

- `GET /api/me/stats` usa dias UTC sobre `createdAt`; el propio implementador lo reporto como posible diferencia de timezone. Aceptable para V4 si queda documentado.
- `registerWithCredentials` siembra datos en registro nuevo, pero la logica no esta extraida como seed idempotente reusable. No bloquea el contrato actual de `POST /api/auth/register`, aunque limita reintentos/manual backfill.
