# Contratos que el frontend espera para v3 — FinanceVier

> Generado el 2026-06-27 tras incorporar la API v2 y dejar **cableadas** las features de v3.
> Lista lo que la UI **ya consume** y el contrato v2 **no expone todavía**.
> Todas estas features están implementadas en el front con **degradación elegante**: si el endpoint
> responde `404`/`501`, la UI muestra estado vacío o "próximamente" y **no rompe**. Cuando el backend
> publique cada endpoint, **se activan solas, sin cambios de UI**.
>
> Referencia base: [`contrato-frontend-v2.md`](../para-front/contrato-frontend-v2.md) ·
> Roadmap de producto: [`mejoras-ux-y-roadmap.md`](../para-front/mejoras-ux-y-roadmap.md).

---

## 0. Resumen ejecutivo

| Prioridad | Tema                                                                        | Estado backend                                   | Acción para backend                                  |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| 🔴 Alta   | **Movimientos recurrentes** (`/api/recurring-rules`)                | No existe                                        | Implementar 6 endpoints + modelo`RecurringRule`     |
| 🟡 Media  | **Categorías con ícono/color** (`icon`, `color`)                | No existe                                        | Agregar 2 campos opcionales a`Category`             |
| 🟡 Media  | **Editar/borrar categoría** (`PUT`/`DELETE /api/categories/:id`) | No existe                                        | Implementar (la pantalla de Categorías ya los llama) |
| 🟡 Media  | **Presupuestos** (`/api/budgets`)                                   | No existe                                        | Implementar CRUD + modelo`Budget`                   |
| 🟢 Baja   | **Flujo OAuth de Drive** (obtener `refreshToken`)                   | `POST /connect` existe, falta el flujo cliente | Definir code-vs-refreshToken / URL de consentimiento  |

Convención de degradación: los `GET` de features dormidas (recurrentes, presupuestos) atrapan `404`/`501`
vía `isNotAvailable(e)` en `src/config/api.ts` y devuelven `[]`. Las mutaciones muestran "próximamente".

---

## 1. 🔴 Movimientos recurrentes — `/api/recurring-rules`

El diferencial del producto (roadmap §2). Resuelve "lo predecible no se carga a mano": sueldo, alquiler,
servicios, cuotas. La UI ya tiene: switch **"Repetir cada mes"** en el form de movimiento, tarjeta
**"Por confirmar (N)"** en el dashboard, y sección **gestión** en Ajustes (pausar/borrar).

**Headers:** `Authorization` + `X-Owner-Id` (como el resto de recursos del owner).

### Modelo `RecurringRule`

```typescript
{
  id: string                 // UUID
  ownerId: string
  walletId: string
  destinationWalletId: string | null   // solo TRANSFER
  categoryId: string
  movementType: "INCOME" | "EXPENSE" | "TRANSFER"
  amount: string             // decimal-string, igual que Transaction ("250.50")
  description: string | null
  dayOfMonth: number         // 1..31
  frequency: "MONTHLY"       // MVP: solo MONTHLY (luego WEEKLY/YEARLY)
  autoPost: boolean          // true = inserta sin pedir confirmación
  startDate: string          // ISO 8601
  endDate: string | null     // para cuotas/préstamos (N meses); null = indefinida
  nextRunDate: string        // ISO 8601 — próximo vencimiento (denormalizado)
  active: boolean            // pausar/reanudar sin borrar
  createdAt: string
  updatedAt: string
}
```

### Endpoints

| Método    | Ruta                                 | Uso en la UI                                      |
| ---------- | ------------------------------------ | ------------------------------------------------- |
| `GET`    | `/api/recurring-rules`             | Lista en Ajustes → "Movimientos recurrentes"     |
| `POST`   | `/api/recurring-rules`             | Switch "Repetir cada mes" al cargar un movimiento |
| `PUT`    | `/api/recurring-rules/:id`         | Pausar/reanudar (`active`), editar monto/día   |
| `DELETE` | `/api/recurring-rules/:id`         | Borrar regla                                      |
| `GET`    | `/api/recurring-rules/pending`     | Tarjeta "Por confirmar" del dashboard             |
| `POST`   | `/api/recurring-rules/:id/confirm` | Botón "Confirmar" → crea la`Transaction`      |

**POST body** (lo que envía el front):

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

> `frequency` se omite → asumir `MONTHLY`. Respuesta `201` con el `RecurringRule` creado.

**PUT body** (todos opcionales): `{ amount?, dayOfMonth?, autoPost?, active?, endDate? }`.

**`GET /pending`**: devuelve un array de `RecurringRule` con `nextRunDate <= hoy` aún no confirmadas.
La UI muestra `description`/categoría + `amount` y un botón Confirmar por ítem.

**`POST /:id/confirm`**: materializa la transacción (misma transacción ACID que un alta manual; ver
roadmap §5) y avanza `nextRunDate`. Respuesta `204` o el `Transaction` creado (la UI solo necesita éxito;
invalida `transactions` y `wallets`).

### Disparo (sugerencia del roadmap §2.3)

- **MVP lazy:** materializar on-read al cargar dashboard/login: `autoPost=true` → inserta; resto → "pendiente".
- **Upgrade:** cron diario sobre `nextRunDate <= CURRENT_DATE`.

> La inserción automática **debe** pasar por la misma transacción ACID que un alta manual (locks `FOR UPDATE`),
> no por un atajo — coherencia de balances.

---

## 2. 🟡 Categorías — ícono/color y edición

### 2.1 Campos `icon` y `color` en `Category`

Hoy las categorías son texto plano. La UI ya muestra una **grilla de íconos** y colores; mientras el
backend no los exponga, los **deriva del nombre** de forma determinista (fallback en
`src/features/categories/categoryMeta.ts`). Para persistir la elección del usuario:

```typescript
// Category (agregado)
icon: string | null    // clave estable, p. ej. "utensils", "bus", "home" (catálogo abajo)
color: string | null   // hex, p. ej. "#3ABFBF"
```

**Catálogo de claves de ícono** que el front envía/espera (lucide):
`utensils, cart, bus, car, home, lightbulb, wifi, phone, drama, dumbbell, health, education, shirt, gift, plane, receipt, card, wallet, piggy, tag`.

`POST /api/categories` y el (nuevo) `PUT` aceptan `icon`/`color` opcionales. Si llegan `null`, la UI usa el fallback.

### 2.2 Editar / borrar categoría

La pantalla **Ajustes → Categorías** (nueva en el front) ya llama:

| Método    | Ruta                    | Notas                                                                      |
| ---------- | ----------------------- | -------------------------------------------------------------------------- |
| `PUT`    | `/api/categories/:id` | Body opcional:`{ name?, icon?, color? }`. No cambia `movementType`.    |
| `DELETE` | `/api/categories/:id` | Definir política si la categoría tiene transacciones (`409` sugerido). |

> Mientras no existan, la UI captura `404`/`501` y muestra "Editar/Eliminar categorías estará disponible próximamente".

---

## 3. 🟡 Presupuestos — `/api/budgets`

"Gasté 80% de Comida este mes" (roadmap §3). La UI ya cruza presupuestos con el gasto real del mes y
dibuja barras de progreso en el dashboard (rojo si se pasa). Oculto si no hay presupuestos / endpoint dormido.

**Headers:** `Authorization` + `X-Owner-Id`.

### Modelo `Budget`

```typescript
{
  id: string
  ownerId: string
  categoryId: string
  month: string        // "YYYY-MM" (mes al que aplica el límite)
  limit: string        // decimal-string, igual que el resto de montos
  createdAt: string
  updatedAt: string
}
```

### Endpoints

| Método    | Ruta                 | Uso                                                           |
| ---------- | -------------------- | ------------------------------------------------------------- |
| `GET`    | `/api/budgets`     | Barras de progreso en dashboard                               |
| `POST`   | `/api/budgets`     | `{ categoryId, month: "2026-06", limit: 50000 }` → `201` |
| `PUT`    | `/api/budgets/:id` | `{ limit }`                                                 |
| `DELETE` | `/api/budgets/:id` | `204`                                                       |

> El front filtra por mes actual en cliente; alcanza con que `GET` devuelva los presupuestos del owner.

---

## 4. 🟢 `POST /api/drive/connect` — flujo OAuth (sigue pendiente de v1)

`GET /api/me` ya expone `driveConnected` ✅ (la UI lo usa para habilitar adjuntos). Lo que falta es **cómo
el cliente obtiene el `refreshToken`** que pide `POST /api/drive/connect`: obtener un refresh token en el
cliente no es estándar.

**A definir:** ¿el endpoint espera el `refreshToken` ya obtenido, o el **authorization code** del
consentimiento (scope `drive.file`, `access_type=offline`) para que el backend haga el intercambio?
Idealmente el backend expone también la URL de consentimiento. Punto de integración marcado en
`src/features/drive/components/DriveSection.tsx`.

> Sin Drive conectado, la UI de adjuntos muestra "Conectá Google Drive en Ajustes" y no permite subir.

---

## 5. Dónde tocar en el frontend si cambian los contratos

| Si cambia…                                     | Ajustar en                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| Forma de`RecurringRule` o sus endpoints       | `src/features/recurring/` (`types/`, `api/useRecurring.ts`)         |
| Campos`icon`/`color` o catálogo de íconos | `src/features/categories/` (`types/category.ts`, `categoryMeta.ts`) |
| `PUT`/`DELETE` categorías                  | `src/features/categories/api/useCategories.ts`                          |
| Forma de`Budget` o sus endpoints              | `src/features/budgets/`                                                 |
| Flujo de Drive (code vs refreshToken)           | `src/features/drive/`                                                   |
| Criterio de "endpoint dormido"                  | `isNotAvailable()` en `src/config/api.ts`                             |
