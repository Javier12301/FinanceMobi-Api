# Revision V3 CP1-CP4 - Follow-up de fixes

## Estado de verificacion

- `npx tsc --noEmit`: OK.
- `npx vitest run`: OK, 13 suites / 135 tests.
- `openspec validate --all --strict --no-interactive`: OK, 9 items.
- `npm audit --omit=dev`: OK, 0 vulnerabilidades.

Los fixes F1, F3, F4, F5, F6, F7 y F8 quedaron aplicados en lo funcional. F2 mejoro la atomicidad entre transaccion y avance de `nextRunDate`, pero introdujo una brecha financiera bloqueante en el orden de lock/lectura de balances.

## Hallazgos Bloqueantes

### F9 - Bloqueante - Confirmacion recurrente lee balances antes del `FOR UPDATE`

**Archivo:** `src/features/recurring/recurring.service.ts:122-141`

`confirmRuleAtomically()` toma `FOR UPDATE` sobre `RecurringRule`, pero para wallets hace:

1. `tx.wallet.findUnique(...)` para leer `currentBalance`.
2. `SELECT id FROM Wallet ... FOR UPDATE`.
3. Calcula el nuevo saldo con el valor leido antes del lock.

Esto viola la regla financiera del proyecto: las filas de wallet afectadas deben bloquearse antes de leer/mutar el balance. Bajo concurrencia, especialmente con `getPendingRules()` ejecutando varias reglas `autoPost=true` en `Promise.allSettled`, dos confirmaciones sobre la misma wallet pueden calcular desde saldos obsoletos y pisarse entre si.

Ejemplo:

- Wallet inicia en 100.
- Regla A y regla B leen 100 antes de lock.
- A lockea, escribe 110.
- B lockea despues, pero calcula desde su copia vieja 100 y escribe 120.
- Resultado esperado: 130. Resultado posible: 120.

El mismo patron existe para destino de transferencias: `dest` se lee despues del lock, pero source no; ademas conviene mantener un orden de lock estable para source/destination y evitar deadlocks.

**Fix esperado:**

- Dentro de `confirmRuleAtomically()`, bloquear todas las wallets afectadas antes de leer `currentBalance`.
- Para `TRANSFER`, bloquear source y destination en orden deterministico por id antes de leer ambas filas.
- Despues del lock, volver a leer las wallets dentro de la misma transaccion y calcular saldos con esos valores bloqueados.
- Mantener la creacion de `Transaction`, `TransactionHistory` y avance de `nextRunDate` dentro de la misma `prisma.$transaction`.
- Agregar test que pruebe el orden de operaciones o, preferentemente, una prueba de integracion/concurrencia que confirme dos reglas vencidas sobre la misma wallet sin perdida de saldo.

**Criterio de aceptacion:**

- No debe existir lectura de `currentBalance` de source/destination antes del lock correspondiente.
- `autoPost=true` con multiples reglas vencidas sobre la misma wallet debe producir saldo final acumulado exacto.
- `POST /api/recurring-rules/:id/confirm` concurrente sobre reglas distintas de la misma wallet no debe perder actualizaciones.

## Notas de Revision

- La validacion OAuth `state` ahora existe con Redis TTL y consumo de state.
- La conexion Drive fue restringida al owner autenticado, no a delegados.
- Categorias aceptan `null` en `icon`/`color` al crear.
- Delete de categoria contempla transacciones, budgets y reglas recurrentes.
- Las validaciones de `movementType`, `destinationWalletId` y fechas 29-31 fueron agregadas.

## Resultado

No aprobar CP1-CP4 todavia. Resolver F9 y volver a ejecutar:

```powershell
npx tsc --noEmit
npx vitest run
openspec validate --all --strict --no-interactive
npm audit --omit=dev
```
