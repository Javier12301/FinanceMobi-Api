# Mejoras UX y roadmap — FinanceVier

> Documento de producto/UX. No es código. Pensado sobre la UI actual ya implementada
> (login, dashboard, billeteras, movimientos, ajustes/delegación).
> Foco: **reducir la fricción de cargar gastos/ingresos**, que es el riesgo #1 del producto.

---

## 0. El problema central

Una app de finanzas personales **muere por falta de datos**, no por falta de features.
Si registrar un gasto cuesta 6 toques y 20 segundos, el usuario deja de hacerlo en una semana
y el balance queda mentiroso. Todo lo de abajo se ordena por **cuánto reduce esa fricción**.

Regla de diseño: **el camino feliz de "anoté un gasto" debe ser ≤ 3 toques y < 5 segundos.**

---

## 1. Quick wins de carga (alto impacto, bajo esfuerzo)

Mejoras sobre el form de movimiento actual (`TransactionFormModal`), sin features nuevas grandes.

| # | Mejora | Por qué | Esfuerzo |
|---|--------|---------|----------|
| 1 | **Teclado numérico primero**: al abrir el FAB, foco directo en el monto con teclado numérico (`inputmode="decimal"`). Hoy hay un paso previo de elegir tipo. | El 80% de las cargas son gastos. Que "gasto" sea el default y el monto lo primero. | XS |
| 2 | **Gasto por defecto**: el paso 1 (Gasto/Ingreso/Transferencia) arranca en Gasto preseleccionado; el usuario solo cambia si hace falta. | Quita 1 toque al caso más común. | XS |
| 3 | **Montos sugeridos / chips**: botones rápidos (1.000, 5.000, 10.000…) y "último monto de esta categoría". | Evita tipear. | S |
| 4 | **Última billetera y categoría recordadas** como default (por tipo de movimiento). | La gente repite contexto (misma billetera diaria). | S |
| 5 | **Fecha = hoy por defecto** con chips "Hoy / Ayer" (ya casi está; falta el chip Ayer). | Nadie quiere abrir un date picker para "ayer". | XS |
| 6 | **Categorías como grilla de íconos** en vez de `<select>`. Tocar el ícono = elegir. | Un select es lento en mobile; una grilla es 1 toque. | S |
| 7 | **Duplicar movimiento**: en el drawer de detalle, botón "Repetir". | "El café de todos los días" se carga en 1 toque. | S |
| 8 | **Crear categoría inline**: si no existe, "+ Nueva categoría" dentro del mismo flujo. | Hoy hay que salir a otra pantalla (que ni existe aún en UI). | S |
| 9 | **Confirmación no bloqueante**: tras guardar, toast con "Deshacer" (4s) en vez de cerrar y listo. | Permite errores rápidos sin miedo → la gente carga más relajada. | S |

> Falta funcional detectado: **no hay pantalla para gestionar categorías** (crear/editar). El backend ya
> expone `POST/GET /api/categories`. Es prerequisito de varias de arriba. Recomendado agregarla pronto.

---

## 2. ⭐ Movimientos recurrentes / programados (el pedido principal)

Resuelve directamente la vagancia: **lo que es predecible no se carga a mano**.

Casos: sueldo mensual (ingreso), alquiler/servicios/Netflix (gasto fijo), cuotas de préstamo o
tarjeta (gasto fijo con fin de plazo).

### 2.1 Enfoque recomendado (lazy y correcto): "reglas + confirmación al vencer"

No inventar un motor de scheduling complejo. Una tabla de **reglas de recurrencia** + un disparador:

- **Regla** = plantilla de transacción + cuándo se repite (día del mes / frecuencia) + opcional fecha fin.
- Al vencer, el sistema **propone** la transacción y el usuario la confirma con 1 toque
  (o se auto-confirma si la regla está marcada como "automática").

Por qué confirmar y no insertar siempre en silencio: un sueldo puede variar, un servicio puede no
debitarse. La confirmación de 1 toque evita balances falsos sin agregar fricción real.
La opción "automática total" queda como casilla para los pagos 100% fijos (alquiler).

### 2.2 Modelo de datos mínimo (para backend)

```
RecurringRule
  id            uuid pk
  ownerId       uuid
  walletId      uuid
  categoryId    uuid
  movementType  INCOME | EXPENSE | TRANSFER
  amount        decimal
  description   varchar null
  dayOfMonth    int        -- 1..31 (o frecuencia: ver abajo)
  frequency     MONTHLY    -- MVP: solo MONTHLY; luego WEEKLY/YEARLY
  autoPost      boolean    -- true = inserta sin preguntar
  startDate     date
  endDate       date null  -- para préstamos/cuotas (N meses)
  nextRunDate   date        -- denormalizado: próximo vencimiento
  destinationWalletId uuid null
```

Para préstamos/cuotas con N cuotas: `endDate` (o un `installmentsLeft int`) acota el plazo.
Mostrar en UI "Cuota 3 de 12".

### 2.3 Disparo (lazy → robusto)

- **MVP lazy**: al abrir la app / cargar el dashboard, el backend (o un check al hacer login) materializa
  las reglas con `nextRunDate <= hoy`: las `autoPost=true` se insertan como `Transaction`; las demás
  generan "pendientes por confirmar". No necesita cron al principio.
  `// ponytail: materialización on-read; cron nocturno si el volumen lo pide`
- **Upgrade**: un cron diario (ya hay infra para schedulers en el stack del backend) que recorre
  `RecurringRule WHERE nextRunDate <= CURRENT_DATE`, inserta y avanza `nextRunDate`. Esto cubre el caso
  de usuarios que no abren la app.

### 2.4 Endpoints que el frontend necesitaría

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/api/recurring-rules` | Listar reglas del owner |
| `POST` | `/api/recurring-rules` | Crear regla |
| `PUT` | `/api/recurring-rules/:id` | Editar (monto, día, pausar) |
| `DELETE` | `/api/recurring-rules/:id` | Borrar |
| `GET` | `/api/recurring-rules/pending` | Vencidas no confirmadas (para el "inbox" del dashboard) |
| `POST` | `/api/recurring-rules/:id/confirm` | Confirmar una pendiente → crea la Transaction |

### 2.5 UX

- En el form de movimiento: switch **"Repetir cada mes"** → al activarlo aparece "día del mes" y
  "automático sí/no". Convierte un gasto que ya estás cargando en una regla, sin pantalla aparte.
- En el dashboard: tarjeta **"Por confirmar (3)"** arriba, con los vencimientos pendientes y un
  botón "Confirmar" por cada uno (o "Confirmar todos").
- Sección en Ajustes: **"Movimientos recurrentes"** para ver/pausar/editar reglas.

---

## 3. Faltantes para no ser "genérico"

Cosas que diferencian la app de un Excel con login. Priorizado.

| Prioridad | Qué | Detalle |
|-----------|-----|---------|
| 🔴 | **Categorías con ícono y color** | Hoy son texto plano. Ícono+color hace la lista de movimientos legible de un vistazo (y habilita la grilla del punto 1.6). Requiere `icon`/`color` en `Category` (backend). |
| 🔴 | **Gestión de categorías (UI)** | No existe pantalla; el endpoint sí. Bloquea varias mejoras. |
| 🟡 | **Presupuestos por categoría** | "Gasté 80% de Comida este mes". Da propósito al registro: el usuario carga para no pasarse. Tabla `Budget(categoryId, month, limit)`. |
| 🟡 | **Resumen / gráficos** | Gasto por categoría (donut) y evolución mensual (barras). El dashboard hoy muestra totales pero no el "¿en qué se me va?". Una librería de charts liviana basta. |
| 🟡 | **Búsqueda de movimientos** | Filtro por texto en descripción. Trivial sobre la lista actual. |
| 🟢 | **Exportar a CSV** | Un botón. Útil para contadores/respaldo. Cero backend si se arma en cliente. |
| 🟢 | **Saldo proyectado** | "A fin de mes vas a tener X" usando las reglas recurrentes. Diferencial fuerte una vez que existan recurrentes. |

---

## 4. Funcionalidades nuevas / casos de uso

Ordenadas por relación impacto/esfuerzo. Las primeras atacan la fricción; las últimas son "wow".

1. **Recordatorio diario** (notificación push, ya previsto con Capacitor): "¿Gastaste algo hoy?" a una
   hora elegida. Combate el olvido, que es la otra cara de la vagancia.
2. **Widget / acceso rápido**: al abrir la app, el FAB de "+ gasto" disponible desde cualquier pantalla
   (ya está). Sumar atajo de teclado en desktop (`N` = nuevo movimiento).
3. **Plantillas de gasto frecuente**: lista de "favoritos" (Café, Nafta, Súper) que cargan monto+categoría
   precargados. Es el punto 1.7 (duplicar) llevado a accesos directos fijos.
4. **Importar resumen / foto de ticket (futuro)**: OCR del comprobante para autocompletar monto y fecha.
   Encaja con Drive (ya se sube la foto) — la imagen ya está, falta extraer datos. Alto valor, alto esfuerzo.
5. **Transferencias entre billeteras con costo** (comisiones): caso real de billeteras virtuales.
6. **Multi-moneda** (si aplica al público): hoy todo es un símbolo `$`. Si hay usuarios con USD/ARS,
   guardar `currency` por billetera. **YAGNI si el público es mono-moneda** — no construir hasta que se pida.
7. **Modo "cierre de mes"**: pantalla que resume el mes y arranca el siguiente, mostrando recurrentes que
   van a impactar. Convierte el registro en un ritual.

---

## 5. Consejos de sistema (producto + técnico)

- **Onboarding con datos, no vacío**: al registrarse, crear 1 billetera "Efectivo" y un set de categorías
  por defecto (Comida, Transporte, Servicios, Sueldo…). Un dashboard vacío es abandono asegurado.
  Esto es backend (seed por usuario) — barato y de altísimo impacto en retención.
- **Estados vacíos que enseñan**: ya hay `EmptyState`; que cada uno tenga una acción ("Creá tu primera
  billetera") en vez de solo informar. (Parcialmente hecho.)
- **Optimistic updates**: al cargar un gasto, reflejarlo en el balance al instante y reconciliar con el
  server (TanStack Query lo soporta). Sensación de velocidad = más cargas.
- **Accesibilidad de tap targets**: en mobile, botones ≥ 44px. Revisar los íconos de acciones chicas
  (editar/eliminar) que vienen del diseño de escritorio.
- **No castigar errores**: borrado con "Deshacer" en vez de modal de confirmación pesado para acciones
  reversibles. El modal de confirmar se justifica solo en lo irreversible (eliminar billetera con datos).
- **Métrica norte**: medir "% de días con al menos 1 movimiento cargado" por usuario. Es el único KPI que
  predice si la app sirve. Todo feature se evalúa contra esa métrica.
- **Seguridad/consistencia ya cubierta** por el backend (locks `FOR UPDATE`, X-Owner-Id, JWT+Redis):
  mantenerla al agregar recurrentes — la inserción automática debe pasar por la **misma** transacción ACID
  que una carga manual, no por un atajo.

---

## 6. Priorización sugerida (si hubiera que elegir)

**Sprint 1 (fricción):** categorías con ícono/color + pantalla de categorías + gasto-por-defecto +
teclado numérico primero + defaults recordados. → la app pasa de "se puede" a "da gusto" cargar.

**Sprint 2 (el diferencial):** movimientos recurrentes (reglas + confirmar al vencer) + tarjeta
"Por confirmar" + recordatorio push. → ataca de raíz la vagancia.

**Sprint 3 (propósito):** presupuestos + resumen/gráficos + saldo proyectado con recurrentes.
→ le da una razón al usuario para seguir cargando.

---

## 7. Impacto en frontend cuando lleguen los contratos

| Feature | Dónde toca |
|---------|------------|
| Categorías ícono/color | `src/features/categories/`, grilla en `TransactionFormModal` |
| Recurrentes | nuevo `src/features/recurring/`, switch en `TransactionFormModal`, tarjeta en `DashboardPage` |
| Presupuestos | nuevo `src/features/budgets/`, barra de progreso en dashboard |
| Resumen/charts | `DashboardPage` + librería de gráficos liviana |

Ver también [`backend-pendientes-ui-v1.md`](./backend-pendientes-ui-v1.md) para los endpoints ya pendientes.
