# Contrato Pendiente Frontend → Backend v4.1

> Generado: 2026-06-28  
> Contexto: correcciones de diseño detectadas tras activar V4. No bloquea el frontend actual (degrada elegante), pero sin estos cambios el sistema de deudas con cuotas queda inconsistente.

---

## Problema actual

Al crear una `Debt` con `installmentsTotal`, el backend genera una `RecurringRule` vinculada (`recurringRuleId`). Sin embargo:

1. **Doble registro:** confirmar la regla recurrente crea una `Transaction` aislada — no llama a la lógica de `/debts/:id/pay`. Resultado: `installmentsPaid` nunca avanza, `remaining` nunca baja, aunque el gasto ya se registró.
2. **Sin trazabilidad:** las transacciones generadas por `/pay` no tienen `debtId`, haciendo imposible saber desde Movimientos qué cuota pagaste y a qué préstamo corresponde.

---

## 1. Unificación del flujo de cuotas

### Regla de negocio

Cuando una `RecurringRule` tiene un `debtId` vinculado, confirmar esa regla (sea por `autoPost` o por confirmación manual desde PendingRecurringCard) **debe ejecutar la lógica de `/debts/:id/pay`** internamente — no crear una transacción aislada.

Un solo click del usuario en "Confirmar cuota" debe producir:
- ✅ Una `Transaction` de tipo `EXPENSE`/`INCOME` en la billetera
- ✅ `Debt.remaining` decrementado en el monto de la cuota
- ✅ `Debt.installmentsPaid` incrementado en 1
- ✅ `Debt.dueDate` avanzado al próximo período
- ✅ `Debt.status = "PAID"` si `remaining` llega a 0

### Cambios en el modelo `RecurringRule`

Agregar campo opcional:

```typescript
debtId?: string | null   // FK a Debt; presente solo si esta regla dispara cuotas de una deuda
```

### Cambios en el handler de confirmación de RecurringRule

```
POST /api/recurring-rules/:id/confirm    // ya existe para autoPost: false
```

Lógica modificada (pseudocódigo):

```
if (rule.debtId) {
  // delegar a la lógica de pay — mismo código que POST /debts/:id/pay
  await payDebt({
    debtId: rule.debtId,
    walletId: rule.walletId,
    amount: rule.amount,         // monto de la cuota
    date: new Date(),
  })
  // payDebt crea la Transaction y actualiza Debt — no crear otra transacción acá
} else {
  // comportamiento actual: crear Transaction aislada
  await createTransaction({ ... })
}
```

### Comportamiento de `autoPost: true` con deuda vinculada

Si la regla tiene `autoPost: true` y `debtId`, el cron nocturno debe ejecutar `payDebt()` en vez de `createTransaction()` directamente.

---

## 2. Trazabilidad: `debtId` en `Transaction`

### Cambio en el modelo `Transaction`

Agregar campo nullable (sin breaking change):

```typescript
debtId?: string | null   // presente si la transacción provino de un pago de deuda
```

Esto permite al frontend filtrar movimientos por deuda y mostrar el origen en el detalle.

### Descripción auto-generada en `/pay`

Al ejecutar `POST /debts/:id/pay` (o la confirmación de RecurringRule con debtId), el backend debe setear en `Transaction.description`:

```
"Cuota {installmentsPaid + 1}/{installmentsTotal} — {counterparty}"
// Ej: "Cuota 1/12 — Banco Macro"
// Si es pago único (installmentsTotal = null): "Pago — {counterparty}"
```

Si el usuario ya escribió una descripción custom, usar la custom. Si no, usar el auto-generado.

---

## 3. Flujo de creación de deuda con cuotas (resumen)

```
POST /api/debts
  body: { installmentsTotal: 12, dueDate: "2026-07-04", ... }

Backend crea:
  1. Debt { remaining = principal, installmentsPaid = 0, status = "ACTIVE" }
  2. RecurringRule {
       movementType: "EXPENSE" (si I_OWE) | "INCOME" (si OWED_TO_ME),
       amount: principal / installmentsTotal,   // cuota mensual estimada
       dayOfMonth: dueDate.getDate(),
       autoPost: false,                         // el usuario confirma cada cuota
       debtId: debt.id,                         // ← vínculo clave
     }
  3. Debt.recurringRuleId = rule.id
```

---

## 4. API sin cambios de contrato para el frontend

El frontend **no necesita cambios** para adoptar estas correcciones. El `TransactionDrawer` ya muestra `description`, por lo que "Cuota 1/12 — Banco Macro" aparecerá automáticamente. El `debtId` puede ignorarse hasta que se implemente un link directo desde el drawer a la deuda.

Flujos que el frontend ya tiene cableados y que funcionarán correctamente tras este fix:

| Flujo | Estado actual | Estado tras v4.1 |
|-------|--------------|------------------|
| Crear deuda con cuotas | ✅ | ✅ (sin cambio) |
| PendingRecurringCard muestra cuota | ✅ | ✅ (sin cambio) |
| Confirmar cuota → Transaction creada | ✅ | ✅ |
| Confirmar cuota → Debt.remaining baja | ❌ | ✅ |
| Confirmar cuota → installmentsPaid avanza | ❌ | ✅ |
| Movimiento muestra "Cuota N/M — banco" | ❌ | ✅ |
| debtId en Transaction para filtrado | ❌ | ✅ |

---

## 5. Errores a mantener

Sin cambios en la gestión de errores existente:

| HTTP | Cuándo |
|------|--------|
| `400` | `amount > remaining` en pay |
| `404` | Deuda o regla no encontrada / no pertenece al owner |
| `409` | Intentar confirmar una regla ya confirmada en el período actual |

---

## Prioridad

🔴 **Alta** — sin este fix un usuario que usa "Plan mensual" para confirmar cuotas de préstamo nunca ve bajar su deuda, lo que corrompe los datos de `remaining` y `installmentsPaid` y destroza la confianza en el módulo.
