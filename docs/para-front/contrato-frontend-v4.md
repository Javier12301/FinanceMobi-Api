# Contrato Frontend v4 — FinanceVier Backend

> Generado: 2026-06-28  
> Change: `unblock-frontend-ui-v4` — verificado en revisión, 182/182 tests, tsc limpio  
> Base anterior: [`contrato-frontend-v3.md`](./contrato-frontend-v3.md)

Todos los endpoints nuevos ya están desplegados. La UI que degrada a estado vacío en v3 **se activa automáticamente sin cambios de frontend**.

---

## 0. Resumen de cambios respecto a v3

| Feature | Endpoints | Estado |
|---|---|---|
| Onboarding seed (wallet + categorías) | Se dispara en `POST /api/auth/register` | ✅ activo |
| Stats de actividad / racha | `GET /api/me/stats` | ✅ activo |
| Deudas y préstamos | `GET/POST/PUT/:id/DELETE/:id /api/debts` + `POST /api/debts/:id/pay` | ✅ activo |
| Push notifications (device tokens) | `POST/DELETE /api/me/devices` | ✅ activo |
| Preferencias de notificación | `GET/PUT /api/me/notification-prefs` | ✅ activo |
| Insights mensuales | `GET /api/insights` | ✅ activo |
| Filtros server-side en transacciones | `GET /api/transactions` con query params | ✅ activo |

**Deferrals V4 (no implementados, no bloqueantes):**
- Push delivery real (FCM/APNs) — candidatos calculados, el envío físico queda pendiente
- Plantillas de gasto frecuente (`/api/templates`)
- OCR de comprobante
- Multi-moneda

---

## 1. Onboarding Seed

Al registrar un usuario con `POST /api/auth/register`, el backend **crea automáticamente** dentro de la misma transacción:

- **1 billetera "Efectivo"** — tipo `CASH`, `initialBalance: 0`, `currentBalance: 0`
- **8 categorías por defecto** con `icon`/`color`:

| name | movementType | icon | color |
|------|--------------|------|-------|
| Comida | `EXPENSE` | `utensils` | `#F97316` |
| Transporte | `EXPENSE` | `bus` | `#3B82F6` |
| Servicios | `EXPENSE` | `lightbulb` | `#F59E0B` |
| Supermercado | `EXPENSE` | `cart` | `#10B981` |
| Salud | `EXPENSE` | `health` | `#EF4444` |
| Ocio | `EXPENSE` | `drama` | `#8B5CF6` |
| Sueldo | `INCOME` | `wallet` | `#22C55E` |
| Otros | `EXPENSE` | `tag` | `#6366F1` |

La operación es **idempotente**: si el owner ya tiene wallets/categorías, no crea duplicados.

El frontend no necesita cambios. El dashboard ya no cae en estado vacío al primer login.

---

## 2. Stats de actividad — `GET /api/me/stats`

**Autenticación:** JWT únicamente. **No acepta** `X-Owner-Id`.

```
GET /api/me/stats
Authorization: Bearer <token>
```

**Respuesta 200:**

```typescript
{
  currentStreak: number       // días consecutivos con al menos 1 movimiento hasta hoy
  longestStreak: number       // racha más larga histórica
  daysActiveThisMonth: number // días únicos con actividad en el mes calendario actual
  totalMovements: number      // total de transacciones no borradas del usuario
  firstMovementAt: string | null // ISO 8601, fecha del primer movimiento registrado
}
```

**Cálculo:** fechas en UTC. Un día cuenta si tiene al menos 1 transacción no soft-deleted. La racha actual se calcula hacia atrás desde hoy (si hoy no tiene actividad aún, sigue contando la de ayer).

**Estado vacío (sin movimientos):**

```json
{
  "currentStreak": 0,
  "longestStreak": 0,
  "daysActiveThisMonth": 0,
  "totalMovements": 0,
  "firstMovementAt": null
}
```

---

## 3. Deudas y préstamos — `/api/debts`

Todos los endpoints requieren `Authorization` + `X-Owner-Id`.

### 3.1 GET /api/debts

Listado de deudas del owner activo.

**Respuesta 200:** array de objetos `Debt`:

```typescript
{
  id: string
  ownerId: string
  direction: "I_OWE" | "OWED_TO_ME"
  counterparty: string                // nombre de la persona
  categoryId: string | null
  principal: string                   // Decimal serializado como string
  remaining: string                   // Decimal serializado como string
  recurringRuleId: string | null
  installmentsTotal: number | null
  installmentsPaid: number
  dueDate: string | null              // ISO 8601
  status: "ACTIVE" | "PAID"
  notes: string | null
  createdAt: string
  updatedAt: string
}
```

Filtros disponibles por query param: `status` (`ACTIVE` | `PAID`).

### 3.2 POST /api/debts

Requiere rol `OWNER` o `SUPERVISOR`.

**Body:**

```typescript
{
  direction: "I_OWE" | "OWED_TO_ME"   // requerido
  counterparty: string                  // requerido
  principal: number                     // requerido, > 0
  categoryId?: string                   // debe pertenecer al owner activo
  recurringRuleId?: string
  installmentsTotal?: number            // entero positivo
  dueDate?: string                      // ISO 8601
  notes?: string
}
```

**Respuesta 201:** objeto `Debt` creado (misma forma que GET).

### 3.3 PUT /api/debts/:id

Requiere rol `OWNER` o `SUPERVISOR`. Solo el owner del debt puede editarlo.

**Body:** cualquier subconjunto de campos editables (`counterparty`, `categoryId`, `dueDate`, `notes`, `status`).

**Respuesta 200:** objeto `Debt` actualizado.

### 3.4 DELETE /api/debts/:id

Requiere rol `OWNER` o `SUPERVISOR`. Solo el owner puede borrar.

**Respuesta 204** sin body.

### 3.5 POST /api/debts/:id/pay

Pago parcial o total de una deuda. **Atómico:** actualiza el ledger de transacciones y el estado de la deuda en la misma transacción de base de datos.

Requiere rol `OWNER` o `SUPERVISOR`.

**Body:**

```typescript
{
  amount: number    // requerido, > 0, debe ser ≤ remaining
  walletId: string  // requerido, debe pertenecer al owner activo
  date?: string     // ISO 8601, default: now
}
```

**Efecto:**
- `direction = "I_OWE"` → crea transacción `EXPENSE` en `walletId`
- `direction = "OWED_TO_ME"` → crea transacción `INCOME` en `walletId`
- Decrementa `remaining` en `amount`
- Incrementa `installmentsPaid` si aplica
- Si `installmentsTotal` existe, avanza `dueDate` al siguiente período
- Si `remaining` llega a 0 → `status: "PAID"`

**Respuesta 200:** objeto `Debt` actualizado.

**Errores:**
- `400`: `amount > remaining`
- `400`: `walletId` no pertenece al owner activo
- `404`: deuda no encontrada o no pertenece al owner

---

## 4. Push Notifications — device tokens

Todos los endpoints usan solo `Authorization` (JWT del usuario autenticado). **No aceptan** `X-Owner-Id`.

### 4.1 POST /api/me/devices

Registra un token de dispositivo para notificaciones push.

```typescript
// Body
{
  token: string        // FCM token (Android) o APNs token (iOS)
  platform: "android" | "ios" | "web"
}
```

**Respuesta 201:**

```typescript
{
  id: string
  userId: string
  token: string
  platform: string
  createdAt: string
}
```

Un mismo usuario puede tener múltiples devices. Si se re-registra el mismo `token`, hace upsert (actualiza `platform`).

### 4.2 DELETE /api/me/devices/:token

Elimina el device token del usuario autenticado. El token va en el path — **URL-encodearlo** si contiene caracteres especiales.

**Respuesta 204** sin body.

**Error 404** si el token no existe para ese usuario.

### 4.3 GET /api/me/notification-prefs

Devuelve las preferencias de notificación del usuario. Si no existen, las crea con defaults.

**Respuesta 200:**

```typescript
{
  id: string
  userId: string
  dailyReminder: boolean      // default: true
  budgetAlerts: boolean       // default: true
  recurringAlerts: boolean    // default: true
  reminderHour: string        // default: "21:00" — formato HH:mm
  createdAt: string
  updatedAt: string
}
```

### 4.4 PUT /api/me/notification-prefs

Actualiza preferencias. Solo los campos enviados se modifican.

**Body (todos opcionales):**

```typescript
{
  dailyReminder?: boolean
  budgetAlerts?: boolean
  recurringAlerts?: boolean
  reminderHour?: string   // formato HH:mm (ej. "20:00")
}
```

**Respuesta 200:** prefs actualizadas.

---

## 5. Insights mensuales — `GET /api/insights`

Requiere `Authorization` + `X-Owner-Id`.

```
GET /api/insights?month=2026-06
```

**Query params:**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `month` | `YYYY-MM` | mes actual | Mes a analizar |

**Respuesta 200:**

```typescript
{
  month: string                    // "2026-06"
  income: {
    total: string                  // Decimal como string
    deltaPercent: number | null    // % vs mes anterior (null si no hay datos previos)
  }
  expenses: {
    total: string
    deltaPercent: number | null
  }
  topCategories: Array<{
    categoryId: string
    name: string
    total: string                  // Decimal como string
    count: number
  }>                               // top 3 por gasto
  biggestExpense: {
    id: string
    amount: string
    description: string | null
    date: string
    categoryId: string
  } | null
}
```

**Nota:** si el owner no tiene transacciones en el mes, todos los totales son `"0"` y `topCategories` es `[]`.

---

## 6. Filtros server-side en transacciones — `GET /api/transactions`

### Modo V3 (sin query params) — sin cambios

Si se llama **sin ningún query param**, la respuesta sigue siendo el **array plano V3**. No hay cambios de comportamiento para el frontend que ya usa esta ruta.

```
GET /api/transactions
→ Transaction[]   (array, igual que v3)
```

### Modo V4 (con cualquier query param) — envelope paginado

Si se pasa **cualquier query param** (incluyendo solo `page` o solo `type`), la respuesta cambia al envelope paginado:

```
GET /api/transactions?type=EXPENSE&page=1&pageSize=20
→ { items: Transaction[], total: number, page: number, pageSize: number }
```

**Query params disponibles:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `q` | `string` | Búsqueda en `description` (contains) |
| `from` | ISO 8601 | Fecha mínima (incluye desde) |
| `to` | ISO 8601 | Fecha máxima (incluye hasta) |
| `type` | `"INCOME"` \| `"EXPENSE"` \| `"TRANSFER"` | Filtrar por tipo |
| `categoryId` | `uuid` | Filtrar por categoría |
| `walletId` | `uuid` | Filtrar por billetera |
| `page` | `number` | Default: 1 |
| `pageSize` | `number` | Default: 50, máximo: 200 |

**Notas:**
- `walletId` con UUID no perteneciente al owner → `{ items: [], total: 0, page, pageSize }` (no 403, para no revelar existencia)
- Los resultados en modo V4 siempre van ordenados por `date desc`
- El filtro `q` usa `contains` sin `mode: 'insensitive'` (MySQL es case-insensitive por default con `utf8_general_ci`)

---

## 7. Cambios en modelos existentes

### Registro (`POST /api/auth/register`)

Sin cambios en la interfaz. La respuesta sigue igual. Lo nuevo ocurre internamente (seed de onboarding).

### Transacciones (`Transaction`)

Sin cambios en la shape del objeto. Los filtros son adición de query params opcionales.

---

## 8. Errores comunes — referencia rápida

| HTTP | Cuándo |
|------|--------|
| `400` | Body inválido (Zod), amount ≤ 0, amount > remaining en pay, wallet misma origen/destino en TRANSFER |
| `401` | Sin token o token expirado |
| `403` | Token válido pero sin rol suficiente (ej. ASESOR intentando POST /api/debts) |
| `404` | Recurso no encontrado o no pertenece al owner activo |
| `409` | Conflicto: categoría con transacciones asociadas al intentar borrarla |
| `500` | Error interno — reportar |

---

## 9. Cadena de autenticación — resumen

| Tipo de endpoint | Headers requeridos |
|------------------|-------------------|
| `/api/me/*` (stats, devices, notification-prefs) | `Authorization: Bearer <token>` |
| `/api/debts`, `/api/insights`, `/api/transactions` | `Authorization: Bearer <token>` + `X-Owner-Id: <ownerId>` |
| `/api/auth/*` | Ninguno |

El `ownerId` para `X-Owner-Id` es el `sub` del JWT cuando el usuario opera sobre su propia cuenta, o el `id` del owner delegado cuando se opera como SUPERVISOR/ASESOR en cuenta ajena.
