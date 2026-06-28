# Integración Frontend — Deudas con Cuotas v4.1

> Fecha: 2026-06-28  
> Backend: rama `dev`, commit `8bc89f0`  
> Para: equipo frontend mobile

---

## Qué cambió en el backend

El backend ahora crea automáticamente una `RecurringRule` vinculada al crear una deuda con cuotas. Cuando el usuario confirma esa regla en `PendingRecurringCard`, el backend actualiza `remaining`, `installmentsPaid` y `dueDate` de la deuda en la misma operación.

---

## Cambio requerido en el frontend

### 1. `POST /api/debts` — agregar `walletId` cuando hay cuotas

**Nuevo campo:** `walletId` (UUID, requerido cuando `installmentsTotal` está presente)

```typescript
// Antes
const payload = {
  direction: 'I_OWE',
  counterparty: 'Banco Macro',
  principal: 120000,
  installmentsTotal: 12,
  dueDate: '2026-07-05T00:00:00.000Z',
  categoryId: 'uuid-opcional',
};

// Ahora — agregar walletId
const payload = {
  direction: 'I_OWE',
  counterparty: 'Banco Macro',
  principal: 120000,
  installmentsTotal: 12,
  dueDate: '2026-07-05T00:00:00.000Z',
  categoryId: 'uuid-opcional',
  walletId: 'uuid-del-wallet-seleccionado',  // ← nuevo
};
```

**Cuándo enviarlo:** solo cuando `installmentsTotal` está presente. Para deudas sin cuotas, `walletId` es ignorado (campo opcional en el schema).

**Por qué es necesario:** el backend crea la `RecurringRule` en la misma transacción que la deuda. La regla necesita saber desde qué wallet se descontará cada cuota cuando se confirme.

---

### 2. Tipo `CreateDebtRequest` — agregar campo

```typescript
// src/features/debts/types/debt.ts (o donde esté definido)

export interface CreateDebtRequest {
  direction: 'I_OWE' | 'OWED_TO_ME';
  counterparty: string;
  principal: number;
  categoryId?: string;
  installmentsTotal?: number;
  dueDate?: string;           // ISO 8601
  walletId?: string;          // requerido si installmentsTotal está presente
  notes?: string;
}
```

---

### 3. `DebtFormModal` — pasar el wallet seleccionado

El formulario ya debe tener selección de wallet (o debería tenerla, ya que es la billetera desde donde se pagarán las cuotas). Ese valor debe incluirse en el payload:

```typescript
// DebtFormModal.tsx — ejemplo de cambio mínimo

const handleSubmit = async (formData: DebtFormData) => {
  const payload: CreateDebtRequest = {
    direction: formData.direction,
    counterparty: formData.counterparty,
    principal: formData.principal,
    installmentsTotal: formData.installmentsTotal,
    dueDate: formData.dueDate,
    categoryId: formData.categoryId,
    // Agregar esto:
    walletId: formData.installmentsTotal ? formData.walletId : undefined,
  };

  await debtService.create(payload);
};
```

---

## Qué hace el backend ahora (sin cambios en frontend para confirmar)

Una vez que el frontend envíe `walletId` al crear la deuda, **no se requieren más cambios** para el flujo de confirmación de cuotas. Todo lo siguiente ya funciona:

### Flujo completo tras crear deuda con `walletId`

```
1. POST /api/debts { ..., installmentsTotal: 12, walletId: "w-123" }
   ↓
   Backend crea:
   - Debt { remaining: 120000, installmentsPaid: 0, recurringRuleId: "rule-456" }
   - RecurringRule { debtId: "debt-789", walletId: "w-123", autoPost: false, nextRunDate: dueDate }

2. GET /api/recurring-rules/pending
   ↓
   Responde con la cuota cuando nextRunDate <= now:
   [{ id: "rule-456", amount: 10000, debtId: "debt-789", ... }]

3. POST /api/recurring-rules/rule-456/confirm   ← sin cambios en body
   ↓
   Backend ejecuta en una transacción:
   - Debt.remaining: 120000 → 110000
   - Debt.installmentsPaid: 0 → 1
   - Debt.dueDate: avanza un mes (UTC-safe)
   - Transaction creada con debtId: "debt-789" y description: "Cuota 1/12 — Banco Macro"
   - RecurringRule.nextRunDate avanza al próximo mes
```

---

## Nuevos campos disponibles en las respuestas

### `Transaction` — campo `debtId`

Todas las transacciones generadas por pagos de deuda ahora incluyen `debtId`:

```json
{
  "id": "tx-123",
  "walletId": "w-123",
  "amount": "10000.00",
  "movementType": "EXPENSE",
  "description": "Cuota 1/12 — Banco Macro",
  "debtId": "debt-789",
  "date": "2026-07-05T00:00:00.000Z"
}
```

Esto permite filtrar en `GET /api/transactions?debtId=debt-789` (cuando se implemente) o mostrar el origen en el detalle de la transacción.

### Descripción auto-generada en pagos de deuda

| Caso | Descripción generada |
|------|----------------------|
| Deuda con cuotas | `"Cuota 1/12 — Banco Macro"` |
| Deuda pago único | `"Pago — Banco Macro"` |

---

## Resumen de cambios requeridos

| Archivo | Cambio |
|---------|--------|
| `types/debt.ts` (o similar) | Agregar `walletId?: string` a `CreateDebtRequest` |
| `DebtFormModal.tsx` (o similar) | Incluir `walletId` en el payload cuando `installmentsTotal` está presente |
| Resto del flujo (pending, confirm) | Sin cambios — ya funciona |

---

## Sin walletId — comportamiento de degradación

Si el frontend crea una deuda con `installmentsTotal` pero **sin** `walletId`, el backend crea solo la deuda (sin `RecurringRule`). No hay error — simplemente `recurringRuleId` queda `null` y la cuota no aparece en `/pending`. La deuda se puede pagar manualmente vía `POST /api/debts/:id/pay`.
