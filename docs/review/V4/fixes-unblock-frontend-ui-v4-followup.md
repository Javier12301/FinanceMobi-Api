# Follow-up fixes - unblock-frontend-ui-v4

## Estado de la revision

Revisados los fixes reportados por el implementador. Las verificaciones base pasan:

- `npx tsc --noEmit`: OK
- `npx vitest run`: OK, 17 suites / 176 tests
- `openspec validate --all --strict --no-interactive`: OK, 12/12
- `npm audit --omit=dev`: OK, 0 vulnerabilidades

Smoke test local con `admin@gmail.com` / `admin` contra `http://localhost:3000`:

- `GET /api/transactions` sin query devuelve array V3: OK
- `GET /api/transactions?type=EXPENSE&page=1&pageSize=10` devuelve `{ items, total, page, pageSize }`: OK
- `GET /api/transactions?walletId=<uuid-inexistente>&page=1&pageSize=10` devuelve array vacio: falla de contrato V4

No se aprueba QA manual todavia. Quedan los siguientes fixes residuales.

## F9 - Bloqueante - Wallet no autorizada/inexistente rompe el envelope V4

**Archivo:** `src/features/transactions/transactions.service.ts:85-91`

`listTransactions()` retorna `[]` cuando `filters.walletId` no pertenece al owner activo. Esto era compatible con V3, pero en V4, si existe cualquier query param, el contrato exige `{ items, total, page, pageSize }`. El smoke real confirmo que `?walletId=00000000-0000-0000-0000-000000000000&page=1&pageSize=10` devuelve array.

**Fix esperado:** si `hasQueryParams=true` y el `walletId` no pertenece al owner, devolver `{ items: [], total: 0, page, pageSize }` con defaults/coercion ya aplicados. Si `hasQueryParams=false`, puede mantenerse el comportamiento V3.

**Tests requeridos:** endpoint/service test para wallet no autorizada o inexistente con query params, verificando envelope V4.

## F10 - Alto - Budget notification calcula gasto con rango/tipo incompleto

**Archivo:** `src/features/notifications/notifications.service.ts:78-99`

Los candidatos de budget suman `budget.category.transactions` con `deletedAt=null` y `date >= primer dia del mes`, pero no limitan `date < primer dia del mes siguiente` ni `movementType='EXPENSE'`. Una transaccion futura de la misma categoria, o un ingreso asociado a esa categoria, puede disparar `budget_warning`/`budget_exceeded` de forma incorrecta.

**Fix esperado:** filtrar transacciones de budget por:

- `movementType: 'EXPENSE'`
- `date >= monthStart`
- `date < nextMonthStart`
- `deletedAt: null`

Mantener el calculo owner-scoped por budget owner.

**Tests requeridos:** budget no debe disparar por ingresos, por gastos fuera del mes, ni por transacciones futuras.

## F11 - Alto - Notification candidates ignora usuarios sin preferencias persistidas

**Archivo:** `src/features/notifications/notifications.service.ts:38-52`

`getNotificationCandidates()` parte solo de `NotificationPreference.findMany()`. Un usuario con device token pero sin fila en `NotificationPreference` queda fuera de daily reminder, budget alerts, recurring alerts y streak risk, aunque el contrato V4 define defaults habilitados para la primera lectura.

**Fix esperado:** para candidatos, considerar usuarios con dispositivos aunque no tengan preferencias persistidas, aplicando defaults V4 (`dailyReminder=true`, `reminderHour='21:00'`, `budgetAlerts=true`, `recurringAlerts=true`). Alternativamente, crear preferencias por default al registrar device.

**Tests requeridos:** usuario con device y sin prefs debe recibir candidatos default cuando correspondan.

## F12 - Medio - Streak risk no verifica actividad historica

**Archivo:** `src/features/notifications/notifications.service.ts:102-118`

El comentario dice "usuarios con actividad previa", pero la implementacion notifica a cualquier usuario con prefs/device que no cargo nada hoy, incluso si nunca tuvo movimientos. Esto puede generar ruido en usuarios recien registrados.

**Fix esperado:** antes de emitir `streak_risk`, verificar que el usuario tenga al menos una transaccion historica anterior a hoy, o una racha/actividad previa calculable. Mantener el disparo solo a las 22:00.

**Tests requeridos:** no emitir `streak_risk` para usuario sin movimientos historicos; emitirlo para usuario con actividad previa y sin actividad hoy.

## Observaciones cerradas

- F1, F4, F5 y F7 estan corregidos en codigo.
- F2 esta corregido para `createTransactionInTx`, que era el camino nuevo usado por create/debt payment.
- F3 esta corregido para query params normales, salvo el caso de wallet no autorizada documentado como F9.
- F8 queda aceptado como desviacion documentada: el repo usa `uuid()` como convencion existente.
