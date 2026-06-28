# Contratos que el frontend espera para v4 — FinanceMobile

> Generado el 2026-06-27, tras cerrar v3 (categorías icon/color, presupuestos, recurrentes, Drive OAuth).
> Mismo criterio que v3: lo que se liste acá se cablea en el front con **degradación elegante**
> (404/501 → estado vacío) y **se activa solo** cuando el backend lo publique.
>
> Base: [`contrato-frontend-v3.md`](../para-front/contrato-frontend-v3.md) ·
> UX/retención que justifica cada ítem: [`mejoras-ux-retencion-v4.md`](../para-front/mejoras-ux-retencion-v4.md).

---

## 0. Resumen ejecutivo

El producto ya **se puede usar** (v1–v3). El riesgo de v4 no es "faltan features" sino **retención**:
las apps de finanzas mueren cuando el usuario deja de cargar a las 2-3 semanas. Todo lo de abajo
está ordenado por **cuánto evita ese abandono**, no por dificultad.

| Prioridad | Tema | Estado backend | Por qué mueve la aguja |
|-----------|------|----------------|------------------------|
| 🔴 Alta | **Seed de onboarding** (billetera + categorías por defecto al registrarse) | No existe | Un dashboard vacío = abandono el día 1. El mayor ROI del doc. |
| 🔴 Alta | **Push notifications** (registrar device token + recordatorios) | No existe | El olvido es la otra cara de la vagancia. Trae al usuario de vuelta. |
| 🔴 Alta | **Stats de actividad / racha** (`GET /api/me/stats`) | No existe | Gamifica el hábito. Es la métrica-norte hecha visible. |
| 🔴 Alta | **Deudas y préstamos** (`/api/debts`) | No existe | Pedido concreto: gestionar deudas/préstamos con cuotas y vencimientos. UI ya cableada (pantalla "Plan"). |
| 🟡 Media | **Insights mensuales** (`GET /api/insights`) | No existe | "Gastaste 20% más que el mes pasado" da motivo para volver. |
| 🟡 Media | **Filtros/búsqueda server-side** en transacciones | Cliente filtra todo hoy | Necesario cuando el historial crece (paginar). |
| 🟢 Baja | **Plantillas de gasto frecuente** (`/api/templates`) | No existe | Acelera la carga; puede ser localStorage primero. |
| 🟢 Baja | **OCR de comprobante** (`POST .../parse-receipt`) | No existe | Diferencial fuerte, alto esfuerzo. Encaja con Drive (la foto ya se sube). |
| 🟢 Baja | **Multi-moneda** (`currency` por billetera) | Todo es `$` | **YAGNI** salvo que haya público USD/ARS real. |

---

## 1. 🔴 Seed de onboarding — al registrar usuario

**El cambio de retención más barato que existe.** Hoy un usuario nuevo cae en un dashboard 100% vacío
(lo confirmamos: balance $0, sin billeteras, sin categorías) y no tiene nada que tocar.

**Acción backend:** en el handler de `POST /api/auth/register` (o el primer login), sembrar para el nuevo owner:

- 1 billetera **"Efectivo"** (tipo efectivo, saldo `0`).
- Un set de categorías por defecto con `icon`/`color` ya seteados:

| name | movementType | icon | color |
|------|--------------|------|-------|
| Comida | EXPENSE | `utensils` | `#F97316` |
| Transporte | EXPENSE | `bus` | `#3B82F6` |
| Servicios | EXPENSE | `lightbulb` | `#F59E0B` |
| Supermercado | EXPENSE | `cart` | `#10B981` |
| Salud | EXPENSE | `health` | `#EF4444` |
| Ocio | EXPENSE | `drama` | `#8B5CF6` |
| Sueldo | INCOME | `wallet` | `#22C55E` |
| Otros | EXPENSE | `tag` | `#6366F1` |

> Las claves de `icon` salen del catálogo lucide ya definido en v3 (`contrato-frontend-v3.md §1.1`).
> El front no necesita cambios: ya renderiza categorías con icon/color. Solo deja de ver el vacío.
> **No es destructivo:** si el usuario borra estas categorías, es su decisión (DELETE ya da 409 si hay tx).

**Métrica:** medir % de usuarios que cargan ≥1 movimiento en su primer día con seed vs sin seed.

---

## 2. 🔴 Push notifications — recordatorios

El front se empaqueta con Capacitor (mobile). Para notificar hace falta backend que **guarde el token de
dispositivo** y **dispare** mensajes.

### 2.1 Registrar / borrar device token

| Método | Ruta | Body |
|--------|------|------|
| `POST` | `/api/me/devices` | `{ "token": "<fcm/apns token>", "platform": "android" \| "ios" \| "web" }` |
| `DELETE` | `/api/me/devices/:token` | — (al desloguear o desactivar avisos) |

Headers: `Authorization` (es del usuario autenticado, no usa `X-Owner-Id`).

### 2.2 Disparadores (qué notificar)

| Trigger | Mensaje | Cuándo |
|---------|---------|--------|
| **Recordatorio diario** | "¿Gastaste algo hoy?" | Hora elegida por el usuario (default 21:00). Combate el olvido. |
| **Recurrente por confirmar** | "Tenés 2 movimientos por confirmar" | Cuando una `RecurringRule` con `autoPost=false` vence. |
| **Presupuesto al límite** | "Llevás 90% de Comida este mes" | Al cruzar 80%/100% de un `Budget`. |
| **Racha en riesgo** | "No perdás tu racha de 6 días 🔥" | Si no cargó nada y son las 22:00. |

> Implementación lazy: reusar el cron diario que v3 sugería para recurrentes (`§2.3` de pendientes-v3).
> Un solo job nocturno calcula a quién notificar. No hace falta infra de streaming.

### 2.3 Preferencias (necesita persistencia)

`GET`/`PUT /api/me/notification-prefs` → `{ dailyReminder: bool, reminderHour: "21:00", budgetAlerts: bool, recurringAlerts: bool }`.
El front ya tendrá una sección "Notificaciones" en Ajustes preparada para esto.

---

## 3. 🔴 Stats de actividad / racha — `GET /api/me/stats`

Convierte la **métrica-norte** ("% de días con al menos 1 movimiento") en algo que el usuario *ve* y
quiere mantener. Es gamificación barata y honesta.

```typescript
// GET /api/me/stats  →  200
{
  currentStreak: number      // días consecutivos con ≥1 movimiento cargado
  longestStreak: number
  daysActiveThisMonth: number
  totalMovements: number
  firstMovementAt: string | null   // ISO — para "Llevás X días con FinanceMobile"
}
```

- "Días consecutivos" = días calendario (timezone del usuario) con al menos 1 `Transaction` creada.
- El front lo muestra como un chip "🔥 6 días" en el dashboard y un mini-card en Ajustes.
- Barato de calcular: un `COUNT(DISTINCT date)` sobre las transacciones del owner.

> Si el cálculo de racha en vivo pesa, denormalizar `lastMovementDate` + `currentStreak` en el usuario
> y actualizarlo al crear cada transacción. `// ponytail: vista calculada primero, denormalizar si duele`.

---

## 3.5 🔴 Deudas y préstamos — `/api/debts`

Pedido concreto del usuario: gestionar en un solo lugar las **deudas propias** (préstamo de banco,
"le debo a alguien") y los **préstamos dados** ("le presté, me deben"), con cuotas y vencimientos.
La UI ya está cableada: **pantalla "Plan"** (`/plan`) que agrupa ingresos fijos + gastos fijos + deudas,
y un modal de alta de deuda. Hoy degrada a vacío (404/501) hasta que exista el endpoint.

> **Decisión de producto ya tomada:** la plata de terceros (ej. la mamá del usuario) **NO** va acá como
> categoría: va como **cuenta separada vía delegación** (el usuario la gestiona como SUPERVISOR). Este
> módulo es de las deudas/préstamos del **owner activo**. Por eso usa `X-Owner-Id` como el resto.

**Headers:** `Authorization` + `X-Owner-Id`.

### Modelo `Debt`
```typescript
{
  id: string
  ownerId: string
  direction: "I_OWE" | "OWED_TO_ME"   // debo / me deben
  counterparty: string                 // "Banco Macro", "Juan"
  categoryId: string | null            // opcional, para agrupar ("Préstamo banco")
  principal: string                    // decimal-string — monto original
  remaining: string                    // decimal-string — saldo pendiente (baja con cada pago)
  recurringRuleId: string | null       // regla que dispara las cuotas (si tiene plan de cuotas)
  installmentsTotal: number | null     // N cuotas; null = pago único
  installmentsPaid: number | null
  dueDate: string | null               // ISO — próxima cuota / pago único
  status: "ACTIVE" | "PAID"
  notes: string | null
  createdAt: string
  updatedAt: string
}
```

### Endpoints

| Método | Ruta | Uso en la UI |
|--------|------|--------------|
| `GET` | `/api/debts` | Listas "Debo" / "Me deben" en la pantalla Plan |
| `POST` | `/api/debts` | Modal "Nueva deuda o préstamo" |
| `PUT` | `/api/debts/:id` | Editar contraparte / saldo / marcar saldada |
| `DELETE` | `/api/debts/:id` | Borrar |
| `POST` | `/api/debts/:id/pay` | Registrar pago/cobro (cableado; UI de pago en fast-follow) |

**POST body** (lo que envía el front):
```json
{
  "direction": "I_OWE",
  "counterparty": "Banco Macro",
  "principal": 120000,
  "categoryId": null,
  "installmentsTotal": 12,
  "dueDate": "2026-07-05T00:00:00.000Z",
  "notes": "Préstamo personal a 12 cuotas"
}
```
- `installmentsTotal` y `dueDate` opcionales (pago único = sin cuotas).
- El backend setea `remaining = principal` al crear y `status = "ACTIVE"`.
- `201` con el `Debt` creado.

**PUT body** (todos opcionales): `{ counterparty?, remaining?, status?, notes? }`.

**`POST /:id/pay`** body: `{ walletId, amount }`. Materializa una `Transaction` desde `walletId`
(EXPENSE si `I_OWE`, INCOME si `OWED_TO_ME`) por el **mismo path ACID** que un alta manual, baja
`remaining`, incrementa `installmentsPaid` y avanza `dueDate` si hay cuotas. Si `remaining` llega a 0 →
`status = "PAID"`.

### Relación con recurrentes (importante, evita duplicar)
Una deuda con cuotas **es** una `RecurringRule` + saldo. Recomendado: al crear un `Debt` con
`installmentsTotal`, el backend crea (o vincula) una `RecurringRule` EXPENSE/INCOME y guarda su id en
`recurringRuleId`. Así las cuotas aparecen en la tarjeta "Por confirmar" del dashboard (que ya existe)
y se confirman con el mismo flujo. **No construir un scheduler paralelo.**

### Sueldo / ingresos fijos (sin entidad nueva)
El usuario también pidió gestionar **uno o más sueldos** (sueldo fijo + promedio del negocio).
Esto **no necesita modelo nuevo**: son `RecurringRule` de tipo `INCOME`. Distinción que ya hace la UI:
- **fijo** = `autoPost: true` (sueldo de farmacéutica, monto constante).
- **promedio/variable** = `autoPost: false` (negocio): cada mes el usuario confirma el monto real.

La pantalla Plan ya lee las reglas INCOME y las muestra agrupadas como "Ingresos fijos" con su etiqueta
fijo/promedio. Solo necesita que `/api/recurring-rules` (ya en v3) funcione.

---

## 4. 🟡 Insights mensuales — `GET /api/insights`

"¿En qué se me va?" con **comparación temporal** (lo que el dashboard de v3 todavía no responde).

```typescript
// GET /api/insights?month=2026-06  →  200
{
  month: "2026-06"
  totalIncome: string        // decimal-string
  totalExpense: string
  vsPreviousMonth: {
    expenseDeltaPct: number   // +12.5 = gastaste 12.5% más que mayo
    incomeDeltaPct: number
  }
  topCategories: Array<{ categoryId: string, total: string, pct: number }>  // ordenado desc
  biggestExpense: { transactionId: string, amount: string, description: string | null } | null
}
```

El front lo usa para una tarjeta "Tu mes" con frases tipo "Gastaste 12% más que en mayo" y el top 3 de categorías.
**Alternativa lazy:** si el backend no lo quiere computar, el front puede derivar casi todo de
`GET /api/transactions` filtrando por mes — pero la comparación mes-a-mes y `biggestExpense` quedan más
limpias del lado servidor. Documentar cuál se elige.

---

## 5. 🟡 Filtros / búsqueda server-side en transacciones

Hoy el front trae todas las transacciones y filtra en cliente. Funciona con pocos datos; **a los meses
de uso** (el caso que queremos: usuarios que SÍ cargan) la lista crece y conviene paginar/filtrar en backend.

```
GET /api/transactions?q=<texto>&from=<ISO>&to=<ISO>&categoryId=<uuid>&walletId=<uuid>&type=EXPENSE&page=1&pageSize=50
→ 200 { items: Transaction[], total: number, page: number, pageSize: number }
```

- `q` busca en `description` (case-insensitive).
- Todos los filtros opcionales y combinables.
- Mantener compatibilidad: sin query params, comportarse como hoy (o devolver la primera página).

> No urgente, pero **definir el contrato ahora** evita romper la UI cuando se active la paginación.

---

## 6. 🟢 Plantillas de gasto frecuente — `/api/templates`

"Café", "Nafta", "Súper": cargas de 1 toque con monto+categoría+billetera precargados.

```typescript
// Template
{ id, ownerId, label: "Café", movementType, amount: string | null, categoryId, walletId, icon, createdAt }
```

`GET`/`POST`/`DELETE /api/templates`. **Empezar en cliente:** se puede prototipar con `localStorage` sin
backend; mover a servidor solo cuando se pida sincronización entre dispositivos. `// ponytail: localStorage primero`.

---

## 7. 🟢 OCR de comprobante — `POST /api/transactions/parse-receipt`

Diferencial alto, esfuerzo alto. La foto del ticket **ya se sube a Drive** (v1+). Falta extraer datos.

```
POST /api/transactions/parse-receipt   (multipart o { driveFileId })
→ 200 { amount: string | null, date: string | null, merchant: string | null, confidence: number }
```

El front lo usaría para **prellenar** el form de movimiento (el usuario corrige y confirma — nunca
insertar automático desde OCR). Candidato a un servicio externo (Google Vision / Textract). **No bloquea v4.**

---

## 8. 🟢 Multi-moneda — `currency` por billetera

Hoy todo es `$`. Solo construir si hay público con USD/ARS real. Implicaría `currency` en `Wallet`,
y decidir si los totales del dashboard se convierten (requiere tasas) o se agrupan por moneda.
**YAGNI explícito:** no hacer hasta que un usuario lo pida.

---

## 9. Dónde toca en el frontend cuando lleguen los contratos

| Contrato | Ajustar en |
|----------|------------|
| Seed onboarding | **Cero front** — solo deja de aparecer el estado vacío. |
| Device tokens / push | nuevo `src/features/notifications/`, sección en Ajustes, plugin Capacitor Push |
| `me/stats` (racha) | `src/features/auth/` o nuevo `src/features/stats/`, chip en `DashboardPage` |
| **`/api/debts`** | **ya cableado**: `src/features/debts/`, pantalla `src/pages/PlanPage.tsx`, ruta `/plan` |
| `insights` | `src/features/summary/` (ya existe), tarjeta "Tu mes" |
| Filtros server-side | `src/features/transactions/api/useTransactions.ts`, `TransactionsPage` |
| Templates | nuevo `src/features/templates/`, accesos rápidos en dashboard |
| OCR | `src/features/transactions/` (prefill del form) + `src/features/drive/` |
| Criterio de "endpoint dormido" | `isNotAvailable()` en `src/config/api.ts` (ya existe) |
