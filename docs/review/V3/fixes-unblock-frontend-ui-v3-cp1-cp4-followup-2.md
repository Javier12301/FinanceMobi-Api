# Revision V3 CP1-CP4 - Follow-up 2

## Estado de verificacion

- `npx tsc --noEmit`: OK.
- `npx vitest run`: OK, 13 suites / 135 tests.
- `openspec validate --all --strict --no-interactive`: OK, 9 items.
- `npm audit --omit=dev`: OK, 0 vulnerabilidades.

F9 quedo corregido para el caso normal: la confirmacion recurrente bloquea wallets antes de leer balances y usa orden deterministico para transferencias entre wallets distintas.

## Hallazgos Bloqueantes

### F10 - Bloqueante - Transferencia recurrente permite source y destination iguales

**Archivo:** `src/features/recurring/recurring.service.ts:54-58`, `src/features/recurring/recurring.service.ts:123-148`

`createRule()` permite crear una regla `TRANSFER` donde `walletId === destinationWalletId`, porque solo valida que la wallet destino exista y pertenezca al owner.

Luego `confirmRuleAtomically()` procesa esa regla como transferencia:

1. Lockea la misma wallet como source/destination.
2. Lee el saldo source.
3. Lee la misma wallet como destino.
4. Actualiza destino sumando el monto.
5. Actualiza source restando el monto desde el saldo original.

Como source y destination son la misma fila, el ultimo update pisa el anterior. Una transferencia a la misma wallet termina descontando saldo, en lugar de rechazarse o no cambiar nada. Es una brecha de consistencia financiera.

**Fix esperado:**

- Rechazar en `createRule()` cualquier `TRANSFER` con `destinationWalletId === walletId` usando HTTP 400.
- Como defensa en profundidad, validar tambien en `confirmRuleAtomically()` antes de mutar saldos, por si ya existen reglas corruptas en DB.
- Agregar tests:
  - `POST /api/recurring-rules` / service create rechaza transferencia a la misma wallet.
  - `confirmRule()` rechaza una regla legacy con source/destination iguales sin crear `Transaction`, sin crear `TransactionHistory` y sin actualizar balances.

**Criterio de aceptacion:**

- No puede persistirse una regla recurrente de transferencia con source y destination iguales.
- Una regla ya persistida en ese estado no puede materializarse.
- Las validaciones finales siguen pasando:

```powershell
npx tsc --noEmit
npx vitest run
openspec validate --all --strict --no-interactive
npm audit --omit=dev
```

