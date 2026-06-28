# Endpoints pendientes y contratos no cumplidos — UI FinanceVier - FINALIZADO

> Generado por el frontend tras el scaffold del proyecto (Vite + React + TS).
> Lista lo que la UI actual **ya consume** pero el **contrato v1 del backend no expone todavía**,
> más las diferencias entre el prototipo/planificación y el contrato real, con cómo las resolvió la UI.
>
> Referencia base: [`contrato-frontend-v1.md`](./contrato-frontend-v1.md).

---

## 0. Resumen ejecutivo

| Prioridad | Tema                                                 | Estado backend       | Acción para backend                                       |
| --------- | ---------------------------------------------------- | -------------------- | ---------------------------------------------------------- |
| 🔴 Alta   | `POST /api/auth/register`                          | No existe            | Implementar (la pantalla de Registro ya lo llama)          |
| 🔴 Alta   | Módulo**Delegaciones** (`/api/delegations`) | No existe            | Implementar GET/POST/DELETE (Ajustes ya lo consume)        |
| 🟡 Media  | Nombre del usuario para la UI                        | Solo`email` en JWT | Agregar`name` al JWT **o** exponer `GET /api/me` |
| 🟡 Media  | `DELETE /api/transactions/:id`                     | Stub`501`          | Resolver política y habilitar                             |
| 🟡 Media  | Adjuntos:`POST` y `DELETE`                       | Stub`501`          | Resolver límites y habilitar                              |
| 🟢 Baja   | Estado de conexión de Drive                         | No hay`GET`        | Exponer estado (hoy se infiere local)                      |
| 🟢 Baja   | Filtro por`movementType` en transacciones          | No soportado         | Opcional: filtrar server-side                              |

Las pantallas que dependen de endpoints inexistentes **están cableadas y muestran error/estado controlado** hasta que el backend los publique (no rompen la app).

---

## 1. Endpoints que la UI espera y NO están en el contrato v1

### 1.1 🔴 `POST /api/auth/register`

La pantalla de Registro (`/register`) lo llama. Hoy no figura en el contrato (solo hay login, google, logout).

**Request**

```json
{ "name": "Javier López", "email": "javier@email.com", "password": "min-8-chars" }
```

| Campo        | Tipo   | Reglas                                              |
| ------------ | ------ | --------------------------------------------------- |
| `name`     | string | requerido                                           |
| `email`    | string | formato email                                       |
| `password` | string | mínimo 8 caracteres (validado también en cliente) |

**Response 200** — igual que `login` (la UI guarda el token e inicia sesión directo):

```json
{ "token": "<jwt>" }
```

**Errores esperados:** `400` (validación), `409` (email ya registrado), `429` (rate limit, mismo que login).

> Alternativa válida: si el registro **no** debe loguear automáticamente, devolver `201` sin token y la UI redirige a login. Avisar cuál se elige.

---

### 1.2 🔴 Módulo de Delegaciones — `/api/delegations`

La sección **Ajustes → Delegación** consume estos tres endpoints. Requieren `Authorization` + `X-Owner-Id` como el resto.
El header `X-Owner-Id` y el cambio de contexto ("ver cuenta de otro") **ya están implementados** en la UI; solo faltan los endpoints.

#### `GET /api/delegations`

Devuelve las dos direcciones de delegación del usuario logueado.

**Response 200** (forma que espera la UI):

```json
{
  "granted": [
    { "id": "uuid", "role": "SUPERVISOR", "user": { "id": "uuid", "name": "María López", "email": "maria@email.com" } }
  ],
  "managing": [
    { "id": "uuid", "role": "ASESOR", "user": { "id": "uuid", "name": "Ana Torres", "email": "ana@email.com" } }
  ]
}
```

- `granted` = personas con acceso a **mi** cuenta → `user` es el **delegado**.
- `managing` = cuentas de otros que **yo** gestiono → `user` es el **dueño** (su `id` se usa como `X-Owner-Id` al "Ver cuenta").
- `role` ∈ `"SUPERVISOR" | "ASESOR"`.

> Si el backend prefiere otra forma (p. ej. un array plano con `direction`), avisar y la UI ajusta el tipo en `src/features/delegations/types/delegation.ts`.

#### `POST /api/delegations` — invitar delegado

```json
{ "email": "delegado@email.com", "role": "SUPERVISOR" }
```

| Campo     | Tipo   | Reglas                      |
| --------- | ------ | --------------------------- |
| `email` | string | email del invitado          |
| `role`  | enum   | `"SUPERVISOR" \| "ASESOR"` |

**Response:** `201` (la UI solo necesita éxito; el cuerpo no se usa). **Errores:** `404` (email no existe), `409` (ya delegado).

#### `DELETE /api/delegations/:id` — revocar acceso

**Response:** `204`. **Errores:** `403`, `404`.

> Nota de negocio para definir: ¿el flujo de invitación requiere aceptación del delegado (como dice el Plan) o es acceso inmediato? La UI hoy asume que tras invitar queda registrado; si hay estado "pendiente/aceptada", agregar un campo `status` a la delegación y avisar.

---

## 2. Diferencias prototipo/planificación vs contrato (resueltas en la UI)

Estas **no requieren acción** del backend salvo aclaración; se documentan para que el backend sepa qué envía/espera la UI.

| Tema                | Prototipo / Plan                    | Contrato v1                    | Qué hace la UI                                  |
| ------------------- | ----------------------------------- | ------------------------------ | ------------------------------------------------ |
| Editar billetera    | `PATCH /api/wallets/:id`          | `PUT /api/wallets/:walletId` | Usa**PUT**                                 |
| Editar transacción | `PATCH /api/transactions/:id`     | `PUT /api/transactions/:id`  | Usa**PUT**                                 |
| Tipos de billetera  | 3 hardcode (Efectivo/Banco/Virtual) | `GET /api/wallet-types` (4)  | Consume el endpoint; mapea labels ES (ver §2.1) |
| Conectar Drive      | `GET /api/auth/google/drive`      | `POST /api/drive/connect`    | Usa**POST /api/drive/connect**             |
| Decimales           | número                             | string (`"1500.00"`)         | Parsea string sin perder precisión              |

### 2.1 Mapeo de `wallet-types`

La UI mapea `name` del catálogo a etiqueta + ícono:

| `name` backend | Label UI |
| ---------------- | -------- |
| `CASH`         | Efectivo |
| `BANK_ACCOUNT` | Banco    |
| `CREDIT_CARD`  | Tarjeta  |
| `SAVINGS`      | Ahorro   |

Si se agregan/renombran tipos, la UI cae a un label genérico con el `name` crudo. Avisar cambios al catálogo.

---

## 3. Endpoints stub (501) que la UI ya tiene cableados

La UI los invoca y maneja el `501` mostrando "no disponible / próximamente" (no rompe). Cuando se resuelva la política backend, **se activan sin cambios de UI** (salvo el detalle de upload, ver nota).

| Endpoint                                                   | Uso en UI                                 | Al habilitar                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `DELETE /api/transactions/:id`                           | Botón "Eliminar" en el drawer de detalle | Funciona directo                                                                                       |
| `POST /api/transactions/:id/attachments`                 | Adjuntar comprobante (form de movimiento) | Definir`Content-Type` (la UI envía `multipart/form-data`, campo `file`) y límites MIME/tamaño |
| `DELETE /api/transactions/:id/attachments/:attachmentId` | (preparado) eliminar comprobante          | Funciona directo                                                                                       |

`GET /api/transactions/:id/attachments` **ya funciona** y se usa en el drawer (link a Google Drive con `googleFileId`).

---

## 4. Faltantes menores / sugerencias

### 4.1 🟡 Nombre del usuario (perfil)

El JWT del contrato trae `sub`, `email`, `jti` — **no** `name`. Hoy la UI muestra el nombre derivado del email (`email.split('@')[0]`).
**Pedido:** agregar `name` al payload del JWT **o** exponer `GET /api/me` → `{ id, name, email }`. Con eso el sidebar/perfil/saludo del dashboard mostrarían el nombre real.

### 4.2 🟢 Estado de conexión de Google Drive

No hay `GET` para saber si el usuario tiene Drive conectado. La UI lo recuerda con un flag local tras un connect exitoso.
**Sugerencia:** un campo en `GET /api/me` (p. ej. `driveConnected: boolean`) o `GET /api/drive/status`.

### 4.3 🟢 `POST /api/drive/connect` — aclaración del flujo OAuth

El contrato pide `{ refreshToken }`, pero obtener un refresh token **en el cliente** no es estándar (se emiten a clientes confidenciales del lado servidor).
**A definir con backend:** ¿el endpoint espera el `refreshToken` ya obtenido, o el **authorization code** del consentimiento (scope `drive.file`, `access_type=offline`) para que el backend haga el intercambio? La UI dejó marcado el punto de integración en `src/features/drive/components/DriveSection.tsx`. Idealmente backend expone también la URL de consentimiento o el flujo a seguir.

### 4.4 🟢 Filtro por tipo de movimiento

`GET /api/transactions` soporta `walletId`, `categoryId`, `dateFrom`, `dateTo` pero **no** `movementType`. La UI filtra por tipo (Ingreso/Gasto/Transferencia) **en cliente**.
**Opcional:** soportar `movementType` como query param para no traer de más en cuentas con muchos movimientos.

---

## 5. Headers que envía la UI (recordatorio)

Todos los endpoints protegidos reciben:

```
Authorization: Bearer <jwt>
X-Owner-Id: <uuid>   # propio (sub del JWT) o el del owner delegado al "ver cuenta de otro"
```

La UI ya cambia `X-Owner-Id` automáticamente al entrar en contexto de delegación e invalida las queries por owner.

---

## 6. Dónde tocar en el frontend si cambian los contratos

| Si cambia…                           | Ajustar en                                       |
| ------------------------------------- | ------------------------------------------------ |
| Forma de`GET /api/delegations`      | `src/features/delegations/types/delegation.ts` |
| Registro (con/sin token)              | `src/features/auth/api/useRegister.ts`         |
| Flujo de Drive (code vs refreshToken) | `src/features/drive/`                          |
| Catálogo de wallet-types             | `src/features/wallets/walletTypeMeta.ts`       |
| Formato de error global               | `src/config/api.ts`                            |
