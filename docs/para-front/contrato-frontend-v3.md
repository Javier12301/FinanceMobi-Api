# Contrato Frontend v3 — FinanceVier Backend

> Generado: 2026-06-27  
> Change: `unblock-frontend-ui-v3` (CP1–CP4)  
> Base anterior: [`contrato-frontend-v2.md`](./contrato-frontend-v2.md)

Todos los endpoints nuevos ya están desplegados. La UI que degrada a 404/501
en v2 **se activa automáticamente sin cambios de frontend**.

---

## 0. Resumen de cambios respecto a v2

| Feature | Endpoints nuevos | Estado |
|---|---|---|
| Categorías — icon/color | `PUT /api/categories/:id`, `DELETE /api/categories/:id` | ✅ activo |
| Presupuestos | `GET/POST/PUT/:id/DELETE/:id /api/budgets` | ✅ activo |
| Reglas recurrentes | `GET/POST/PUT/:id/DELETE/:id /api/recurring-rules` + `/pending` + `/:id/confirm` | ✅ activo |
| Drive OAuth | `GET /api/drive/auth-url` + `POST /api/drive/connect` (ahora recibe `code`) | ✅ activo |

---

## 1. Categorías

### 1.1 Campos nuevos en `Category`

`GET /api/categories` y todas las respuestas de categoría ahora incluyen:

```typescript
{
  id: string
  ownerId: string
  name: string
  movementType: "INCOME" | "EXPENSE" | "TRANSFER"
  icon: string | null   // clave del catálogo (ej. "utensils")
  color: string | null  // hex (ej. "#FF6B6B")
  createdAt: string
}
```

`POST /api/categories` acepta `icon` y `color` opcionales (antes los ignoraba).

**Catálogo de íconos válidos:**
`utensils, cart, bus, car, home, lightbulb, wifi, phone, drama, dumbbell, health, education, shirt, gift, plane, receipt, card, wallet, piggy, tag`

**Color:** cualquier string hex `#RRGGBB`. Si llega `null` o se omite, queda `null` y el frontend usa su fallback de `categoryMeta.ts`.

### 1.2 PUT /api/categories/:id

```
PUT /api/categories/:id
Authorization: Bearer <token>
X-Owner-Id: <ownerId>

Body (todos opcionales):
{
  "name": "Restaurantes",
  "icon": "utensils",
  "color": "#FF6B6B"
}
```

- `movementType` no se puede cambiar (se ignora si viene).
- `404` si no existe o no pertenece al owner.
- Respuesta `200` con el objeto `Category` completo.

### 1.3 DELETE /api/categories/:id

```
DELETE /api/categories/:id
Authorization: Bearer <token>
X-Owner-Id: <ownerId>
```

- `204` si se elimina correctamente.
- `409` si la categoría tiene transacciones, presupuestos o reglas recurrentes referenciadas.
- `404` si no existe o no pertenece al owner.

---

## 2. Presupuestos

**Headers en todos:** `Authorization: Bearer <token>` + `X-Owner-Id: <ownerId>`

### Modelo `Budget`

```typescript
{
  id: string
  ownerId: string
  categoryId: string
  month: string        // "YYYY-MM" (ej. "2026-06")
  limit: string        // decimal-string (ej. "50000.00")
  createdAt: string
  updatedAt: string
}
```

### GET /api/budgets

Devuelve todos los presupuestos del owner (el frontend filtra por mes en cliente).

```
200 → Budget[]
```

### POST /api/budgets

```json
{
  "categoryId": "uuid",
  "month": "2026-06",
  "limit": 50000
}
```

- `201` con el `Budget` creado.
- `409` si ya existe un presupuesto para `(categoryId, month)` del mismo owner.
- `404` si `categoryId` no pertenece al owner.

### PUT /api/budgets/:id

```json
{ "limit": 60000 }
```

- `200` con el `Budget` actualizado.
- `404` si no existe o no pertenece al owner.

### DELETE /api/budgets/:id

- `204` si se elimina.
- `404` si no existe o no pertenece al owner.

---

## 3. Reglas recurrentes

**Headers en todos:** `Authorization: Bearer <token>` + `X-Owner-Id: <ownerId>`

### Modelo `RecurringRule`

```typescript
{
  id: string
  ownerId: string
  walletId: string
  destinationWalletId: string | null   // solo TRANSFER
  categoryId: string
  movementType: "INCOME" | "EXPENSE" | "TRANSFER"
  amount: string             // decimal-string (ej. "12000.00")
  description: string | null
  dayOfMonth: number         // 1–31 (se clampea al último día del mes en feb/abr/etc.)
  frequency: "MONTHLY"       // MVP: solo MONTHLY
  autoPost: boolean
  startDate: string          // ISO 8601
  endDate: string | null
  nextRunDate: string        // ISO 8601 — próximo vencimiento
  active: boolean
  createdAt: string
  updatedAt: string
}
```

### GET /api/recurring-rules

Todas las reglas del owner, orden `createdAt desc`.

### POST /api/recurring-rules

```json
{
  "walletId": "uuid",
  "categoryId": "uuid",
  "movementType": "EXPENSE",
  "amount": 12000.00,
  "description": "Alquiler",
  "dayOfMonth": 5,
  "autoPost": false,
  "destinationWalletId": null,
  "startDate": "2026-06-27T10:00:00.000Z"
}
```

- `frequency` se puede omitir → asume `MONTHLY`.
- `destinationWalletId` requerido solo para `TRANSFER`; debe ser distinto de `walletId`.
- `movementType` debe coincidir con el `movementType` de la categoría → `400` si no coincide.
- `201` con la regla creada (incluye `nextRunDate` calculado).

### PUT /api/recurring-rules/:id

Body (todos opcionales):
```json
{
  "amount": 13000,
  "dayOfMonth": 10,
  "autoPost": true,
  "active": false,
  "endDate": "2026-12-31T00:00:00.000Z"
}
```

- `200` con la regla actualizada.
- `404` si no existe o no pertenece al owner.

### DELETE /api/recurring-rules/:id

- `204` si se elimina.
- `404` si no existe o no pertenece al owner.

### GET /api/recurring-rules/pending

Reglas con `nextRunDate <= ahora`, `autoPost = false` y `active = true`.

**Nota:** al llamar este endpoint, el backend también materializa automáticamente
(en background) las reglas con `autoPost = true` que estén vencidas. El frontend
no necesita hacer nada extra para esas.

```
200 → RecurringRule[]  (ordenado por nextRunDate asc)
```

### POST /api/recurring-rules/:id/confirm

Materializa la transacción ACID (mismo path que un alta manual con `FOR UPDATE` de balance)
y avanza `nextRunDate` al siguiente mes.

- **Idempotente:** si `nextRunDate > ahora` (ya confirmada), devuelve `200` con `{ alreadyConfirmed: true }`.
- `200` con `{ alreadyConfirmed: false }` si se materializó.
- `409` si la regla está pausada (`active = false`).
- `404` si no existe o no pertenece al owner.

---

## 4. Drive OAuth

El flujo cambió de v2 (que esperaba `refreshToken` ya obtenido) al **authorization code flow** estándar.

### GET /api/drive/auth-url

```
GET /api/drive/auth-url
Authorization: Bearer <token>
X-Owner-Id: <ownerId>   ← debe ser el owner autenticado (no delegados)
```

```json
{
  "url": "https://accounts.google.com/o/oauth2/auth?...",
  "state": "uuid-csrf-state"
}
```

**Flujo:**
1. Frontend llama este endpoint y obtiene `url` + `state`.
2. Redirige al usuario a `url` (Google consent screen).
3. Google redirige de vuelta a `GOOGLE_REDIRECT_URI` con `?code=...&state=...`.
4. Frontend extrae `code` y `state` de la URL y llama `POST /api/drive/connect`.

**Restricción:** solo el owner autenticado puede pedir la URL. Un supervisor/asesor
actuando con `X-Owner-Id` de otro owner recibirá `403`.

### POST /api/drive/connect

```
POST /api/drive/connect
Authorization: Bearer <token>
X-Owner-Id: <ownerId>   ← debe ser el owner autenticado

Body:
{
  "code": "4/0AX4XfWh...",   ← authorization code de Google
  "state": "uuid-csrf-state"  ← el mismo state que devolvió auth-url
}
```

- El backend intercambia `code` por tokens con Google, cifra el `refresh_token` con AES-256-GCM y lo persiste.
- El `state` tiene TTL de 10 minutos. Si expiró o no coincide → `400 State OAuth inválido`.
- `200` si conectó correctamente.
- `400` si Google no devuelve `refresh_token` (ya fue canjeado o el scope es incorrecto).

**Redirect URI en Google Cloud Console:**
El backend usa `GOOGLE_REDIRECT_URI`. Debe coincidir exactamente con el URI registrado en la consola.
Valor típico para desarrollo: `http://localhost:5173/auth/drive/callback`.

---

## 5. Desvíos respecto al doc de pendientes v3

| Item | Pendiente v3 | Backend v3 | Nota |
|---|---|---|---|
| `POST /:id/confirm` respuesta | "204 o Transaction" | `200 { alreadyConfirmed }` | La UI solo necesita éxito; invalida queries igual |
| `autoPost=true` materialización | On-read en GET /pending | ✅ implementado on-read | Sin cron (MVP lazy) |
| `frequency` omitido en POST | "asumir MONTHLY" | ✅ default MONTHLY | |
| Drive: code vs refreshToken | "a definir" | ✅ authorization code flow | Definido y documentado arriba |
| DELETE category policy | "409 sugerido" | ✅ 409 si tiene tx/budgets/rules | |

---

## 6. Cambios en endpoints existentes (v2 → v3)

| Endpoint | Cambio |
|---|---|
| `GET /api/categories` | Responde `icon` y `color` (antes ausentes) |
| `POST /api/categories` | Acepta `icon` y `color` opcionales |
| `POST /api/drive/connect` | Body cambió de `{ refreshToken }` a `{ code, state }` |

> **Acción requerida en frontend:** si `POST /api/drive/connect` ya estaba implementado en v2
> con `{ refreshToken }`, actualizar al nuevo body `{ code, state }`.

---

## 7. Headers requeridos en todos los endpoints de recursos

```
Authorization: Bearer <jwt>
X-Owner-Id: <ownerId>    ← UUID del owner cuyos datos se consultan
```

El `X-Owner-Id` puede ser el propio userId (owner) o el ownerId de un workspace
al que el usuario tiene delegación activa (supervisor/asesor).

**Excepción:** `GET /api/drive/auth-url` y `POST /api/drive/connect` solo aceptan
`X-Owner-Id` igual al `userId` del token (no se puede conectar Drive de otro owner).
