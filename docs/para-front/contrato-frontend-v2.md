# Contrato de API Frontend — FinanceVier v2

> Generado el 2026-06-27. Cubre todos los endpoints implementados hasta CP4 del change `unblock-frontend-ui-v2`.
> Supercede al contrato v1. Cambios respecto a v1: registro por email, endpoint de perfil, gestión de delegaciones, eliminación de transacciones (ya no es stub 501).

---

## 1. Conexión a la API

### Local (desarrollo)

```
Base URL: http://localhost:3000/api
```

```bash
docker compose up -d   # MySQL + Redis
npm run dev            # servidor con hot-reload en :3000
```

### Producción

```
Base URL: https://<dominio-por-definir>/api
```

---

## 2. Autenticación

### 2.1 Header de autorización (JWT)

```
Authorization: Bearer <token>
```

El token se obtiene en cualquier endpoint de login o registro. Es un JWT firmado con:

| Campo   | Tipo   | Descripción                        |
|---------|--------|------------------------------------|
| `sub`   | string | UUID del usuario autenticado       |
| `email` | string | Email del usuario                  |
| `jti`   | string | UUID único de sesión (para logout) |

El token expira según `JWT_EXPIRES_IN` (default: 7 días). Un token expirado o revocado devuelve `401`.

### 2.2 Header de contexto de owner

```
X-Owner-Id: <uuid-del-owner>
```

**Obligatorio** en todos los endpoints de wallets, categorías, transacciones y adjuntos. No aplica en endpoints de autenticación ni delegaciones.

| Escenario | Valor de X-Owner-Id |
|---|---|
| Usuario operando sus propios datos | `sub` del JWT |
| Delegado operando cuenta de otro | UUID del owner que delegó acceso |

Si el usuario no es el owner ni tiene delegación activa, el servidor responde `403`.

### 2.3 Decodificar el JWT

```javascript
const payload = JSON.parse(atob(token.split('.')[1]))
const userId = payload.sub   // usar como X-Owner-Id propio
const email  = payload.email
```

---

## 3. Roles y permisos

| Rol          | Crear / Editar / Eliminar | Leer |
|--------------|--------------------------|------|
| `OWNER`      | ✅                        | ✅   |
| `SUPERVISOR` | ✅                        | ✅   |
| `ASESOR`     | ❌                        | ✅   |

Un `ASESOR` que intente una mutación recibe `403`.

---

## 4. Formato de error

```json
{ "error": "Mensaje descriptivo del error" }
```

| Código | Cuándo ocurre |
|--------|---------------|
| `400`  | Body o parámetros inválidos (validación Zod) |
| `401`  | Token ausente, inválido, expirado o revocado |
| `403`  | Rol insuficiente o sin delegación activa |
| `404`  | Recurso no encontrado o fuera del scope del owner (anti-IDOR) |
| `409`  | Conflicto de negocio (duplicado, Drive no conectado, etc.) |
| `429`  | Rate limit excedido (solo endpoints de auth) |
| `500`  | Error interno del servidor |

---

## 5. Endpoints

### 5.1 Health check

#### `GET /api/health`

No requiere autenticación.

**Respuesta 200:**
```json
{ "status": "ok" }
```

---

### 5.2 Autenticación

#### `POST /api/auth/register`

Registro por email y contraseña. Crea el usuario, genera las categorías default y abre sesión en un único paso.

**Rate limit:** mismo que `/login` (5 intentos / IP / 15 min).

**Body:**
```json
{
  "name": "Juan Pérez",
  "email": "juan@ejemplo.com",
  "password": "mi-contraseña"
}
```

| Campo      | Tipo   | Requerido | Reglas         |
|------------|--------|-----------|----------------|
| `name`     | string | ✅        | Mínimo 1 char  |
| `email`    | string | ✅        | Formato email  |
| `password` | string | ✅        | Mínimo 8 chars |

**Respuesta 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

> El token ya incluye sesión activa. Usarlo igual que en login.

**Categorías creadas automáticamente:**

| Nombre | Tipo |
|---|---|
| Comida | EXPENSE |
| Transporte | EXPENSE |
| Servicios | EXPENSE |
| Ocio | EXPENSE |
| Sueldo | INCOME |
| Transferencia | TRANSFER |

**Errores:**
- `400` — Body inválido (password < 8 chars, email mal formado)
- `409` — Email ya registrado

---

#### `POST /api/auth/login`

Login con email y contraseña.

**Rate limit:** 5 intentos / IP / 15 min.

**Body:**
```json
{
  "email": "usuario@ejemplo.com",
  "password": "mi-contraseña"
}
```

**Respuesta 200:**
```json
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

**Errores:** `401` (credenciales incorrectas, mensaje genérico), `429`

---

#### `POST /api/auth/google`

Login / registro con Google ID token (flujo SSO). Si el usuario no existe se crea automáticamente.

**Body:**
```json
{ "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6Ikp..." }
```

**Respuesta 200:**
```json
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

**Errores:** `401` (idToken inválido o email no verificado), `429`

---

#### `POST /api/auth/logout`

Revoca el JWT en Redis.

**Headers:** `Authorization: Bearer <token>`

**Respuesta 204:** sin body.

---

#### `GET /api/me`

Devuelve el perfil del usuario autenticado.

**Headers:** `Authorization: Bearer <token>`

> No requiere `X-Owner-Id`.

**Respuesta 200:**
```json
{
  "id": "uuid",
  "name": "Juan Pérez",
  "email": "juan@ejemplo.com",
  "driveConnected": false
}
```

| Campo            | Tipo    | Descripción |
|------------------|---------|-------------|
| `id`             | string  | UUID del usuario |
| `name`           | string  | Nombre |
| `email`          | string  | Email |
| `driveConnected` | boolean | `true` solo si tanto `encryptedGoogleRefreshToken` como `driveFolderId` están configurados |

**Errores:** `401`, `404`

---

### 5.3 Delegaciones

> Estos endpoints operan sobre el usuario autenticado directamente. **No usan `X-Owner-Id`.**

**Header requerido en todos:** `Authorization: Bearer <token>`

#### `GET /api/delegations`

Lista las delegaciones relacionadas al usuario autenticado.

**Respuesta 200:**
```json
{
  "granted": [
    {
      "id": "uuid",
      "role": "SUPERVISOR",
      "user": { "id": "uuid", "name": "Ana García", "email": "ana@ejemplo.com" }
    }
  ],
  "managing": [
    {
      "id": "uuid",
      "role": "ASESOR",
      "user": { "id": "uuid", "name": "Carlos López", "email": "carlos@ejemplo.com" }
    }
  ]
}
```

| Array      | Descripción |
|------------|-------------|
| `granted`  | Delegaciones que el usuario autenticado **otorgó** a otros. `user` = el delegado. |
| `managing` | Cuentas de otros owners sobre las que el usuario tiene acceso delegado. `user` = el owner. |

---

#### `POST /api/delegations`

Otorga acceso a otro usuario sobre la propia cuenta.

**Body:**
```json
{
  "email": "ana@ejemplo.com",
  "role": "SUPERVISOR"
}
```

| Campo  | Tipo   | Requerido | Reglas |
|--------|--------|-----------|--------|
| `email` | string | ✅       | Email de un usuario registrado |
| `role`  | enum   | ✅       | `"SUPERVISOR"` \| `"ASESOR"` |

**Respuesta 201:**
```json
{
  "id": "uuid",
  "ownerId": "uuid",
  "delegatedUserId": "uuid",
  "role": "SUPERVISOR",
  "active": true,
  "createdAt": "2026-06-27T10:00:00.000Z",
  "updatedAt": "2026-06-27T10:00:00.000Z"
}
```

> Si la delegación existía pero estaba revocada (`active: false`), se reactiva automáticamente con el nuevo rol.

**Errores:**
- `400` — Auto-delegación (mismo email que el usuario autenticado)
- `404` — Email no pertenece a ningún usuario registrado
- `409` — Ya existe una delegación activa con ese usuario

---

#### `DELETE /api/delegations/:id`

Revoca una delegación. Solo el owner que la otorgó puede revocarla.

**Params:** `id` — UUID de la delegación.

**Respuesta 204:** sin body.

**Errores:**
- `403` — El usuario autenticado no es el owner de la delegación
- `404` — Delegación no encontrada

---

### 5.4 Tipos de billetera

#### `GET /api/wallet-types`

No requiere autenticación.

**Respuesta 200:**
```json
[
  { "id": 1, "name": "CASH" },
  { "id": 2, "name": "BANK_ACCOUNT" },
  { "id": 3, "name": "CREDIT_CARD" },
  { "id": 4, "name": "SAVINGS" }
]
```

---

### 5.5 Categorías

**Headers requeridos:** `Authorization` + `X-Owner-Id`

#### `POST /api/categories`

Requiere rol `OWNER` o `SUPERVISOR`.

**Body:**
```json
{ "name": "Supermercado", "movementType": "EXPENSE" }
```

| Campo          | Tipo | Requerido | Reglas |
|----------------|------|-----------|--------|
| `name`         | string | ✅      | Mínimo 1 char |
| `movementType` | enum   | ✅      | `"INCOME"` \| `"EXPENSE"` \| `"TRANSFER"` |

**Respuesta 201:** objeto categoría.

---

#### `GET /api/categories`

Lista las categorías del owner. Accesible para todos los roles.

**Respuesta 200:** array de objetos categoría.

---

### 5.6 Billeteras

**Headers requeridos:** `Authorization` + `X-Owner-Id`

#### `POST /api/wallets`

Requiere rol `OWNER` o `SUPERVISOR`.

**Body:**
```json
{
  "name": "Cuenta BCP",
  "typeId": 2,
  "description": "Cuenta en soles",
  "initialBalance": 1500.00
}
```

| Campo            | Tipo   | Requerido | Reglas |
|------------------|--------|-----------|--------|
| `name`           | string | ✅        | Mínimo 1 char |
| `typeId`         | number | ✅        | Entero positivo (ver `/api/wallet-types`) |
| `description`    | string | ❌        | Opcional |
| `initialBalance` | number | ✅        | >= 0 |

**Respuesta 201:** objeto wallet. `initialBalance` y `currentBalance` se devuelven como **string decimal** (`"1500.00"`).

---

#### `GET /api/wallets`

Lista las billeteras del owner. Todos los roles.

**Respuesta 200:** array de objetos wallet.

---

#### `PUT /api/wallets/:walletId`

Actualiza nombre, tipo o descripción. Requiere `OWNER` o `SUPERVISOR`.

**Body (todos opcionales):**
```json
{ "name": "Nuevo nombre", "typeId": 3, "description": "..." }
```

**Respuesta 200:** objeto wallet actualizado.

---

#### `DELETE /api/wallets/:walletId`

Requiere `OWNER` o `SUPERVISOR`. No se puede eliminar una billetera con transacciones.

**Respuesta 204:** sin body.

**Errores:** `404`, `409` (tiene transacciones)

---

### 5.7 Transacciones

**Headers requeridos:** `Authorization` + `X-Owner-Id`

#### `POST /api/transactions`

Crea una transacción y actualiza atómicamente el balance. Requiere `OWNER` o `SUPERVISOR`.

**Body:**
```json
{
  "walletId": "uuid",
  "categoryId": "uuid",
  "amount": 250.50,
  "movementType": "EXPENSE",
  "date": "2026-06-27T10:00:00.000Z",
  "description": "Almuerzo",
  "destinationWalletId": null
}
```

| Campo                 | Tipo   | Requerido              | Reglas |
|-----------------------|--------|------------------------|--------|
| `walletId`            | string | ✅                     | UUID del owner |
| `categoryId`          | string | ✅                     | UUID del owner |
| `amount`              | number | ✅                     | > 0 |
| `movementType`        | enum   | ✅                     | `"INCOME"` \| `"EXPENSE"` \| `"TRANSFER"` |
| `date`                | string | ✅                     | ISO 8601 |
| `description`         | string | ❌                     | Opcional |
| `destinationWalletId` | string | ✅ solo en `TRANSFER`  | UUID del owner |

**Reglas de balance:**
- `INCOME` → suma a `walletId`
- `EXPENSE` → resta de `walletId`
- `TRANSFER` → resta de `walletId`, suma a `destinationWalletId`

**Respuesta 201:** objeto transacción. `amount` como string decimal.

**Errores:** `400` (monto <= 0, destinationWalletId faltante en TRANSFER), `404` (wallet o categoría fuera de scope)

---

#### `GET /api/transactions`

Lista transacciones del owner. Todos los roles.

**Query params (todos opcionales):**

| Param        | Descripción |
|--------------|-------------|
| `walletId`   | Filtrar por billetera origen |
| `categoryId` | Filtrar por categoría |
| `dateFrom`   | ISO 8601 — inicio inclusivo |
| `dateTo`     | ISO 8601 — fin inclusivo |

> Las transacciones eliminadas (`DELETE`) no aparecen en este listado.

> Anti-IDOR: si `walletId` no pertenece al owner, retorna `[]` (no `403`).

**Respuesta 200:** array de objetos transacción.

---

#### `PUT /api/transactions/:transactionId`

Actualiza y recalcula balance atómicamente. Requiere `OWNER` o `SUPERVISOR`.

> No se puede cambiar `movementType`, `walletId` ni `destinationWalletId`. Para eso: eliminar y recrear.

**Body (todos opcionales):**
```json
{
  "categoryId": "uuid",
  "amount": 300.00,
  "description": "Actualizado",
  "date": "2026-06-28T10:00:00.000Z"
}
```

**Respuesta 200:** objeto transacción actualizado.

**Errores:** `404` (transacción eliminada también retorna 404)

---

#### `DELETE /api/transactions/:transactionId`

Elimina una transacción, revierte el balance y limpia los adjuntos de Drive. Requiere `OWNER` o `SUPERVISOR`.

**Implementación:** soft delete — la transacción no se elimina físicamente de la DB (por integridad del historial de auditoría), pero desaparece de todos los listados y no es operable.

**Orden de operaciones:**
1. Borrar archivos de Drive (si hay adjuntos)
2. Revertir balance de wallet(s) dentro de una transacción DB atómica
3. Crear snapshot en historial de auditoría
4. Marcar transacción como eliminada

**Balance revertido:**
- `INCOME` → resta el monto del wallet origen
- `EXPENSE` → suma el monto al wallet origen
- `TRANSFER` → suma al wallet origen, resta del wallet destino

**Respuesta 204:** sin body.

**Errores:**
- `403` — No es el owner
- `404` — Transacción no encontrada o ya eliminada (idempotente: segundo DELETE retorna 404 sin tocar balances)
- `409` — Tiene adjuntos y Google Drive no está conectado

---

### 5.8 Adjuntos (Google Drive)

**Headers requeridos:** `Authorization` + `X-Owner-Id`

#### `POST /api/drive/connect`

Conecta Google Drive cifrando el refresh token en la DB. Crea la carpeta raíz `FinanceVier` en Drive si no existe.

**Body:**
```json
{ "refreshToken": "1//0g..." }
```

**Respuesta 200:**
```json
{ "message": "Google Drive conectado" }
```

**Errores:** `404` (usuario no encontrado), `500` (error con Google Drive)

---

#### `POST /api/transactions/:transactionId/attachments`

Sube archivos a Google Drive y registra los adjuntos en DB. Requiere `OWNER` o `SUPERVISOR`.

**Body:** `multipart/form-data`, campo `file`. Máximo 3 archivos por request.

**Límites:**
- Máximo 3 archivos por request
- Máximo 5 MB por archivo
- MIME permitidos: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`

**Respuesta 201:** array de adjuntos creados:
```json
[
  {
    "id": "uuid",
    "transactionId": "uuid",
    "googleFileId": "1BxiMVs...",
    "mimeType": "image/jpeg",
    "uploadedAt": "2026-06-27T10:00:00.000Z"
  }
]
```

> Si algún archivo falla al subirse a Drive, se hace rollback de los que ya se subieron y no se persiste nada en DB.

**Errores:**
- `400` — MIME no permitido, más de 3 archivos, archivo > 5 MB
- `403` — No autorizado
- `404` — Transacción no encontrada o eliminada
- `409` — Google Drive no conectado

---

#### `GET /api/transactions/:transactionId/attachments`

Lista los adjuntos de una transacción. Todos los roles.

**Respuesta 200:** array de objetos adjunto (misma forma que el POST).

**Errores:** `403`, `404`

---

#### `DELETE /api/transactions/:transactionId/attachments/:attachmentId`

Elimina el archivo de Drive primero; si falla, retorna error y la DB queda sin cambios. Requiere `OWNER` o `SUPERVISOR`.

**Respuesta 204:** sin body.

**Errores:**
- `403` — No autorizado
- `404` — Adjunto no encontrado, no pertenece a la transacción, o transacción eliminada

---

## 6. Modelos de datos

### User (en JWT y en `GET /api/me`)
```typescript
{
  id: string            // UUID
  name: string
  email: string
  driveConnected: boolean
}
```

### Delegation
```typescript
{
  id: string            // UUID
  ownerId: string       // UUID del owner que otorgó acceso
  delegatedUserId: string  // UUID del usuario con acceso
  role: "SUPERVISOR" | "ASESOR"
  active: boolean
  createdAt: string     // ISO 8601
  updatedAt: string     // ISO 8601
}
```

### Wallet
```typescript
{
  id: string
  ownerId: string
  typeId: number        // 1=CASH 2=BANK_ACCOUNT 3=CREDIT_CARD 4=SAVINGS
  name: string
  description: string | null
  initialBalance: string   // Decimal como string: "1500.00"
  currentBalance: string   // Decimal como string: "1250.00"
  createdAt: string
  updatedAt: string
}
```

### Transaction
```typescript
{
  id: string
  walletId: string
  destinationWalletId: string | null   // solo en TRANSFER
  categoryId: string
  amount: string                        // Decimal como string: "250.50"
  description: string | null
  date: string                          // ISO 8601
  movementType: "INCOME" | "EXPENSE" | "TRANSFER"
  createdAt: string
  updatedAt: string
  // deletedAt no se expone al frontend — las transacciones eliminadas simplemente desaparecen
}
```

### TransactionAttachment
```typescript
{
  id: string
  transactionId: string
  googleFileId: string   // ID en Google Drive
  mimeType: string       // ej. "image/jpeg"
  uploadedAt: string     // ISO 8601
}
```

---

## 7. Tabla de estado de endpoints

| Endpoint | Roles | Estado |
|---|---|---|
| `GET /api/health` | Público | ✅ |
| `POST /api/auth/register` | Público | ✅ **nuevo v2** |
| `POST /api/auth/login` | Público | ✅ |
| `POST /api/auth/google` | Público | ✅ |
| `POST /api/auth/logout` | Autenticado | ✅ |
| `GET /api/me` | Autenticado | ✅ **nuevo v2** |
| `GET /api/delegations` | Autenticado | ✅ **nuevo v2** |
| `POST /api/delegations` | Autenticado | ✅ **nuevo v2** |
| `DELETE /api/delegations/:id` | Autenticado (owner) | ✅ **nuevo v2** |
| `GET /api/wallet-types` | Público | ✅ |
| `POST /api/categories` | OWNER / SUPERVISOR | ✅ |
| `GET /api/categories` | Todos | ✅ |
| `POST /api/wallets` | OWNER / SUPERVISOR | ✅ |
| `GET /api/wallets` | Todos | ✅ |
| `PUT /api/wallets/:id` | OWNER / SUPERVISOR | ✅ |
| `DELETE /api/wallets/:id` | OWNER / SUPERVISOR | ✅ |
| `POST /api/transactions` | OWNER / SUPERVISOR | ✅ |
| `GET /api/transactions` | Todos | ✅ |
| `PUT /api/transactions/:id` | OWNER / SUPERVISOR | ✅ |
| `DELETE /api/transactions/:id` | OWNER / SUPERVISOR | ✅ **era stub 501 en v1** |
| `POST /api/drive/connect` | Autenticado | ✅ |
| `POST /api/transactions/:id/attachments` | OWNER / SUPERVISOR | ✅ |
| `GET /api/transactions/:id/attachments` | Todos | ✅ |
| `DELETE /api/transactions/:id/attachments/:attId` | OWNER / SUPERVISOR | ✅ |

---

## 8. Notas de implementación

### Decimales como strings
Prisma serializa `Decimal` de MySQL como strings en JSON. Parsear con `parseFloat("250.50")` o usar una librería de precisión decimal.

### Fechas en ISO 8601 UTC
Todos los campos de fecha: `"2026-06-27T10:00:00.000Z"`.

### Transacciones eliminadas
`DELETE /api/transactions/:id` aplica **soft delete** internamente. Para el frontend no hay diferencia: las transacciones eliminadas dejan de aparecer en `GET /api/transactions` y todos los endpoints que las referencian por ID devuelven `404`.

### Delegaciones — acceso inmediato
Al crear una delegación (`POST /api/delegations`), el acceso es efectivo de inmediato. No hay flujo de invitación/aceptación.

### Google Drive
Los archivos se suben a la carpeta `FinanceVier` del Drive del **owner** (no del delegado). Un `SUPERVISOR` puede subir adjuntos a transacciones del owner usando el Drive del owner.

### Rate limiting en auth
`/api/auth/login`, `/api/auth/google` y `/api/auth/register` comparten el mismo rate limit por IP. Ante `429`, mostrar mensaje de espera y no reintentar automáticamente.

### Seguridad del token
No almacenar el JWT en `localStorage`. Usar `SecureStorage` en mobile o cookies `httpOnly` en web.
