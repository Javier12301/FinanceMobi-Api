# Contrato de API Frontend — FinanceVier v1

> Generado el 2026-06-27. Cubre los checkpoints CP1–CP7 (implementados y aprobados).
> CP8 (hardening de deploy) está pendiente; la URL de producción se completará al terminar.

---

## 1. Conexión a la API

### Local (desarrollo)

```
Base URL: http://localhost:3000/api
```

Arrancar el servidor:

```bash
docker compose up -d   # MySQL + Redis
npm run dev            # servidor con hot-reload en :3000
```

### Producción (pendiente CP8)

```
Base URL: https://<dominio-por-definir>/api
```

El servidor de producción correrá detrás de Nginx con proxy pass a Express. La ruta `/api/*` se preservará íntegramente.

---

## 2. Autenticación

Todos los endpoints protegidos requieren dos elementos en cada request:

### 2.1 Header de autorización (JWT)

```
Authorization: Bearer <token>
```

El token se obtiene en los endpoints de login. Es un JWT firmado con los campos:

| Campo | Tipo   | Descripción                          |
|-------|--------|--------------------------------------|
| `sub` | string | UUID del usuario autenticado         |
| `email` | string | Email del usuario                  |
| `jti` | string | UUID único de sesión (para logout)   |

El token expira según la variable `JWT_EXPIRES_IN` del servidor (default: 7 días). Las sesiones se revocan en logout: un token expirado o revocado devolverá `401`.

### 2.2 Header de contexto de owner

```
X-Owner-Id: <uuid-del-owner>
```

Este header es **obligatorio** en todos los endpoints de wallets, categorías, transacciones y adjuntos. Determina de qué cuenta se operan los datos.

**Casos de uso:**

- **Usuario operando sus propios datos:** enviar `X-Owner-Id` con el propio `sub` del JWT.
- **Delegado operando cuenta de otro usuario:** enviar `X-Owner-Id` con el UUID del owner que delegó acceso.

Si el usuario no es el owner ni tiene una delegación activa hacia ese owner, el servidor responde `403`.

---

## 3. Roles y permisos

El sistema de delegación define tres roles:

| Rol        | Crear/Editar/Eliminar | Leer |
|------------|----------------------|------|
| `OWNER`    | ✅                   | ✅   |
| `SUPERVISOR` | ✅               | ✅   |
| `ASESOR`   | ❌                   | ✅   |

Los endpoints de escritura exigen `OWNER` o `SUPERVISOR`. Un `ASESOR` que intente una mutación recibirá `403`.

---

## 4. Formato de error

Todos los errores siguen el mismo formato:

```json
{
  "error": "Mensaje descriptivo del error"
}
```

### Códigos HTTP comunes

| Código | Cuándo ocurre                                                            |
|--------|--------------------------------------------------------------------------|
| `400`  | Body o parámetros inválidos (validación Zod o header malformado)         |
| `401`  | Token ausente, inválido, expirado o sesión revocada                      |
| `403`  | Sin permisos (rol insuficiente o sin delegación activa)                  |
| `404`  | Recurso no encontrado o fuera del scope del owner (anti-IDOR)            |
| `409`  | Conflicto de negocio (ej. borrar wallet con transacciones)               |
| `429`  | Rate limit excedido (solo endpoints de auth)                             |
| `500`  | Error interno del servidor                                               |
| `501`  | Funcionalidad no implementada aún (ver endpoints marcados como stub)     |

---

## 5. Endpoints disponibles

### 5.1 Health check

#### `GET /api/health`

Verificar que la API está activa. No requiere autenticación.

**Respuesta 200:**
```json
{ "status": "ok" }
```

---

### 5.2 Autenticación

#### `POST /api/auth/login`

Login con email y contraseña.

**Rate limit:** máximo 5 intentos / IP / 15 min.

**Body:**
```json
{
  "email": "usuario@ejemplo.com",
  "password": "mi-contraseña"
}
```

| Campo      | Tipo   | Requerido | Reglas            |
|------------|--------|-----------|-------------------|
| `email`    | string | ✅        | Formato email     |
| `password` | string | ✅        | Mínimo 1 caracter |

**Respuesta 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errores:**
- `401` — Credenciales incorrectas (mensaje genérico, sin distinguir email vs password)
- `429` — Rate limit excedido

---

#### `POST /api/auth/google`

Login / registro con Google ID token (flujo SSO).

El frontend obtiene el `idToken` de la Google Sign-In API y lo envía aquí. Si el usuario no existe se crea automáticamente.

**Rate limit:** mismo límite que `/login`.

**Body:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6Ikp..."
}
```

| Campo     | Tipo   | Requerido | Reglas             |
|-----------|--------|-----------|--------------------|
| `idToken` | string | ✅        | Google ID token válido |

**Respuesta 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errores:**
- `401` — idToken inválido, expirado, o email no verificado en Google
- `429` — Rate limit excedido

---

#### `POST /api/auth/logout`

Cierra la sesión actual revocando el JWT en Redis.

**Headers requeridos:** `Authorization: Bearer <token>`

**Body:** vacío

**Respuesta 204:** sin body

**Errores:**
- `401` — Token inválido o ya revocado

---

### 5.3 Tipos de billetera (lookup público)

#### `GET /api/wallet-types`

Lista los tipos de billetera disponibles. No requiere autenticación.

**Respuesta 200:**
```json
[
  { "id": 1, "name": "CASH" },
  { "id": 2, "name": "BANK_ACCOUNT" },
  { "id": 3, "name": "CREDIT_CARD" },
  { "id": 4, "name": "SAVINGS" }
]
```

Usar el campo `id` (número entero) al crear una billetera.

---

### 5.4 Categorías

**Headers requeridos en todos:** `Authorization: Bearer <token>` + `X-Owner-Id: <uuid>`

#### `POST /api/categories`

Crea una categoría de movimiento. Requiere rol `OWNER` o `SUPERVISOR`.

**Body:**
```json
{
  "name": "Supermercado",
  "movementType": "EXPENSE"
}
```

| Campo          | Tipo   | Requerido | Reglas                                  |
|----------------|--------|-----------|-----------------------------------------|
| `name`         | string | ✅        | Mínimo 1 caracter                       |
| `movementType` | enum   | ✅        | `"INCOME"` \| `"EXPENSE"` \| `"TRANSFER"` |

**Respuesta 201:**
```json
{
  "id": "uuid",
  "ownerId": "uuid",
  "movementType": "EXPENSE",
  "name": "Supermercado",
  "createdAt": "2026-06-27T10:00:00.000Z"
}
```

**Errores:** `400`, `401`, `403`

---

#### `GET /api/categories`

Lista las categorías del owner. Accesible para todos los roles.

**Respuesta 200:**
```json
[
  {
    "id": "uuid",
    "ownerId": "uuid",
    "movementType": "EXPENSE",
    "name": "Supermercado",
    "createdAt": "2026-06-27T10:00:00.000Z"
  }
]
```

---

### 5.5 Billeteras

**Headers requeridos en todos:** `Authorization: Bearer <token>` + `X-Owner-Id: <uuid>`

#### `POST /api/wallets`

Crea una billetera. Requiere rol `OWNER` o `SUPERVISOR`.

**Body:**
```json
{
  "name": "Cuenta corriente BCP",
  "typeId": 2,
  "description": "Cuenta en soles",
  "initialBalance": 1500.00
}
```

| Campo            | Tipo   | Requerido | Reglas                                    |
|------------------|--------|-----------|-------------------------------------------|
| `name`           | string | ✅        | Mínimo 1 caracter                         |
| `typeId`         | number | ✅        | Entero positivo (ver `/api/wallet-types`) |
| `description`    | string | ❌        | Opcional                                  |
| `initialBalance` | number | ✅        | >= 0 (decimal)                            |

**Respuesta 201:**
```json
{
  "id": "uuid",
  "ownerId": "uuid",
  "typeId": 2,
  "name": "Cuenta corriente BCP",
  "description": "Cuenta en soles",
  "initialBalance": "1500.00",
  "currentBalance": "1500.00",
  "createdAt": "2026-06-27T10:00:00.000Z",
  "updatedAt": "2026-06-27T10:00:00.000Z"
}
```

> **Nota:** `initialBalance` y `currentBalance` se devuelven como string decimal de precisión fija (`"1500.00"`), no como número flotante.

**Errores:** `400`, `401`, `403`

---

#### `GET /api/wallets`

Lista todas las billeteras del owner. Accesible para todos los roles.

**Respuesta 200:** Array de objetos wallet (misma forma que en POST, código 200).

---

#### `PUT /api/wallets/:walletId`

Actualiza nombre, tipo o descripción de una billetera. Requiere rol `OWNER` o `SUPERVISOR`.

**Params:** `walletId` — UUID de la billetera.

**Body:** todos los campos son opcionales, pero se requiere al menos uno.
```json
{
  "name": "Nuevo nombre",
  "typeId": 3,
  "description": "Nueva descripción"
}
```

| Campo         | Tipo   | Requerido | Reglas                    |
|---------------|--------|-----------|---------------------------|
| `name`        | string | ❌        | Mínimo 1 caracter         |
| `typeId`      | number | ❌        | Entero positivo           |
| `description` | string | ❌        | Opcional                  |

**Respuesta 200:** Objeto wallet actualizado.

**Errores:** `400`, `401`, `403`, `404`

---

#### `DELETE /api/wallets/:walletId`

Elimina una billetera. Requiere rol `OWNER` o `SUPERVISOR`.

> **Restricción de negocio:** No se puede eliminar una billetera que tenga transacciones registradas.

**Params:** `walletId` — UUID de la billetera.

**Respuesta 204:** sin body.

**Errores:**
- `401`, `403`, `404`
- `409` — La billetera tiene transacciones y no puede eliminarse

---

### 5.6 Transacciones

**Headers requeridos en todos:** `Authorization: Bearer <token>` + `X-Owner-Id: <uuid>`

#### `POST /api/transactions`

Crea una transacción y actualiza atómicamente el balance de la(s) billetera(s). Requiere rol `OWNER` o `SUPERVISOR`.

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

| Campo                 | Tipo   | Requerido              | Reglas                                       |
|-----------------------|--------|------------------------|----------------------------------------------|
| `walletId`            | string | ✅                     | UUID de billetera origen del owner           |
| `categoryId`          | string | ✅                     | UUID de categoría del owner                  |
| `amount`              | number | ✅                     | Decimal positivo (> 0)                       |
| `movementType`        | enum   | ✅                     | `"INCOME"` \| `"EXPENSE"` \| `"TRANSFER"`    |
| `date`                | string | ✅                     | ISO 8601 datetime (`"2026-06-27T10:00:00.000Z"`) |
| `description`         | string | ❌                     | Opcional                                     |
| `destinationWalletId` | string | ✅ solo si `TRANSFER`  | UUID de billetera destino del owner          |

**Reglas de negocio:**
- `INCOME`: suma `amount` al balance de `walletId`.
- `EXPENSE`: resta `amount` del balance de `walletId`.
- `TRANSFER`: resta de `walletId`, suma a `destinationWalletId`. Requiere `destinationWalletId`.

**Respuesta 201:**
```json
{
  "id": "uuid",
  "walletId": "uuid",
  "destinationWalletId": null,
  "categoryId": "uuid",
  "amount": "250.50",
  "description": "Almuerzo",
  "date": "2026-06-27T10:00:00.000Z",
  "movementType": "EXPENSE",
  "createdAt": "2026-06-27T10:05:00.000Z",
  "updatedAt": "2026-06-27T10:05:00.000Z"
}
```

**Errores:**
- `400` — Monto <= 0, `destinationWalletId` faltante en TRANSFER, body inválido
- `401`, `403`
- `404` — Billetera o categoría no encontrada (o fuera del scope del owner)

---

#### `GET /api/transactions`

Lista transacciones del owner con filtros opcionales. Accesible para todos los roles.

**Query params (todos opcionales):**

| Param        | Tipo   | Descripción                              |
|--------------|--------|------------------------------------------|
| `walletId`   | string | UUID — filtrar por billetera origen      |
| `categoryId` | string | UUID — filtrar por categoría             |
| `dateFrom`   | string | ISO 8601 — fecha inicial inclusiva       |
| `dateTo`     | string | ISO 8601 — fecha final inclusiva         |

**Ejemplo:**
```
GET /api/transactions?walletId=<uuid>&dateFrom=2026-06-01T00:00:00.000Z&dateTo=2026-06-30T23:59:59.999Z
```

> **Anti-IDOR:** Si `walletId` no pertenece al owner, devuelve `[]` (no `403`).

**Respuesta 200:** Array de objetos transacción (misma forma que en POST 201).

---

#### `PUT /api/transactions/:transactionId`

Actualiza una transacción y recalcula el balance atómicamente. Requiere rol `OWNER` o `SUPERVISOR`.

**Params:** `transactionId` — UUID.

**Body:** todos los campos son opcionales.
```json
{
  "categoryId": "uuid",
  "amount": 300.00,
  "description": "Descripción actualizada",
  "date": "2026-06-28T10:00:00.000Z"
}
```

| Campo         | Tipo   | Requerido | Reglas                                        |
|---------------|--------|-----------|-----------------------------------------------|
| `categoryId`  | string | ❌        | UUID de categoría del owner                   |
| `amount`      | number | ❌        | Decimal positivo (> 0)                        |
| `description` | string | ❌        | Texto libre                                   |
| `date`        | string | ❌        | ISO 8601 datetime                             |

> **Nota:** No se puede cambiar `movementType`, `walletId` ni `destinationWalletId` en una edición. Para eso se debe eliminar y recrear (cuando eliminar esté disponible).

**Respuesta 200:** Objeto transacción actualizado.

**Errores:**
- `400`, `401`, `403`
- `404` — Transacción o categoría no encontrada / fuera de scope

---

#### `DELETE /api/transactions/:transactionId`

> **⚠️ No disponible — Stub 501**

La política de eliminación de transacciones está pendiente de resolución.

**Respuesta 501:**
```json
{
  "error": "La política de eliminación de transacciones no está resuelta. Contacta al administrador."
}
```

---

### 5.7 Adjuntos (Google Drive)

**Headers requeridos en todos:** `Authorization: Bearer <token>` + `X-Owner-Id: <uuid>`

#### `POST /api/drive/connect`

Conecta Google Drive del usuario cifrando y persistiendo el refresh token. Crea la carpeta raíz `FinanceVier` en Drive si no existe.

> El refresh token se obtiene del flujo OAuth2 de Google con scope `drive.file`.

**Body:**
```json
{
  "refreshToken": "1//0g..."
}
```

| Campo          | Tipo   | Requerido | Reglas              |
|----------------|--------|-----------|---------------------|
| `refreshToken` | string | ✅        | Refresh token OAuth2 de Google |

**Respuesta 200:**
```json
{
  "message": "Google Drive conectado"
}
```

**Errores:**
- `401`, `403`
- `404` — Usuario no encontrado
- `500` — Error de comunicación con Google Drive

---

#### `POST /api/transactions/:transactionId/attachments`

**Headers:** `Authorization`, `X-Owner-Id`. Roles permitidos: `OWNER`, `SUPERVISOR`.

**Body:** `multipart/form-data`, campo `file`. Máximo 3 archivos por request. Máximo 5 MB por archivo.

**MIME permitidos:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.

**Respuesta 201** — array de adjuntos creados:
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

**Errores:**
- `400` — MIME no permitido, más de 3 archivos, archivo > 5 MB
- `403` — No autorizado
- `404` — Transacción no encontrada
- `409` — Google Drive no conectado

---

#### `GET /api/transactions/:transactionId/attachments`

Lista los adjuntos de una transacción. Accesible para todos los roles.

**Params:** `transactionId` — UUID.

**Respuesta 200:**
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

**Errores:**
- `401`, `403`
- `404` — Transacción no encontrada

---

#### `DELETE /api/transactions/:transactionId/attachments/:attachmentId`

**Headers:** `Authorization`, `X-Owner-Id`. Roles permitidos: `OWNER`, `SUPERVISOR`.

Elimina el archivo de Google Drive primero; si Drive falla, retorna error y la DB queda sin cambios.

**Respuesta 204** — sin cuerpo.

**Errores:**
- `403` — No autorizado (ownership incorrecto)
- `404` — Adjunto no encontrado o no pertenece a la transacción

---

## 6. Modelos de datos completos

### User (visible parcialmente en JWT)
```typescript
{
  id: string           // UUID
  email: string
  name: string
}
```

### WalletType
```typescript
{
  id: number           // 1=CASH, 2=BANK_ACCOUNT, 3=CREDIT_CARD, 4=SAVINGS
  name: string
}
```

### Wallet
```typescript
{
  id: string           // UUID
  ownerId: string      // UUID del owner
  typeId: number       // FK a WalletType
  name: string
  description: string | null
  initialBalance: string  // Decimal como string ej. "1500.00"
  currentBalance: string  // Decimal como string ej. "1250.00"
  createdAt: string    // ISO 8601
  updatedAt: string    // ISO 8601
}
```

### Category
```typescript
{
  id: string           // UUID
  ownerId: string      // UUID del owner
  movementType: "INCOME" | "EXPENSE" | "TRANSFER"
  name: string
  createdAt: string    // ISO 8601
}
```

### Transaction
```typescript
{
  id: string                        // UUID
  walletId: string                  // UUID billetera origen
  destinationWalletId: string|null  // UUID billetera destino (solo TRANSFER)
  categoryId: string                // UUID
  amount: string                    // Decimal como string ej. "250.50"
  description: string | null
  date: string                      // ISO 8601
  movementType: "INCOME" | "EXPENSE" | "TRANSFER"
  createdAt: string                 // ISO 8601
  updatedAt: string                 // ISO 8601
}
```

### TransactionAttachment
```typescript
{
  id: string            // UUID
  transactionId: string // UUID
  googleFileId: string  // ID del archivo en Google Drive
  mimeType: string      // ej. "image/jpeg"
  uploadedAt: string    // ISO 8601
}
```

---

## 7. Flujo de implementación sugerido para el frontend

### Flujo de autenticación
```
1. POST /api/auth/login  →  recibir token
2. Guardar token (SecureStorage / Keychain)
3. En cada request: Authorization: Bearer <token>
4. En cada request a recursos: X-Owner-Id: <sub del JWT>
5. Al logout: POST /api/auth/logout
```

### Flujo típico de uso (sesión propia)
```
X-Owner-Id = sub (el propio userId del JWT)
```

### Flujo de delegado
```
X-Owner-Id = userId del owner que delegó acceso
El backend valida que exista UserDelegation activa.
```

### Decodificar el JWT para obtener `sub`
```javascript
// El payload está en la segunda parte del token (base64url)
const payload = JSON.parse(atob(token.split('.')[1]))
const userId = payload.sub   // usar como X-Owner-Id propio
const email = payload.email
```

---

## 8. Endpoints por estado de implementación

| Endpoint                                              | Estado       |
|-------------------------------------------------------|--------------|
| `GET /api/health`                                     | ✅ Disponible |
| `POST /api/auth/login`                                | ✅ Disponible |
| `POST /api/auth/google`                               | ✅ Disponible |
| `POST /api/auth/logout`                               | ✅ Disponible |
| `GET /api/wallet-types`                               | ✅ Disponible |
| `POST /api/categories`                                | ✅ Disponible |
| `GET /api/categories`                                 | ✅ Disponible |
| `POST /api/wallets`                                   | ✅ Disponible |
| `GET /api/wallets`                                    | ✅ Disponible |
| `PUT /api/wallets/:walletId`                          | ✅ Disponible |
| `DELETE /api/wallets/:walletId`                       | ✅ Disponible |
| `POST /api/transactions`                              | ✅ Disponible |
| `GET /api/transactions`                               | ✅ Disponible |
| `PUT /api/transactions/:transactionId`                | ✅ Disponible |
| `DELETE /api/transactions/:transactionId`             | ✅ Disponible |
| `POST /api/drive/connect`                             | ✅ Disponible |
| `POST /api/transactions/:id/attachments`              | ✅ Disponible |
| `GET /api/transactions/:id/attachments`               | ✅ Disponible |
| `DELETE /api/transactions/:id/attachments/:attachmentId` | ✅ Disponible |

---

## 9. Notas de implementación importantes

### Decimales como strings
Prisma serializa los campos `Decimal` de MySQL como **strings** en JSON, no como números flotantes. El frontend debe parsear `"250.50"` → `parseFloat("250.50")` o usar una librería de precisión decimal para evitar errores de redondeo.

### Fechas en ISO 8601
Todos los campos de fecha se envían y reciben en formato ISO 8601 con timezone UTC: `"2026-06-27T10:00:00.000Z"`.

### Rate limiting en auth
Los endpoints `/api/auth/login` y `/api/auth/google` tienen rate limit por IP. Si el usuario recibe `429`, mostrar un mensaje de espera y no reintentar automáticamente.

### Endpoints stub (501)
Los endpoints marcados como 501 existen en el router pero retornan error inmediatamente. El frontend puede mostrarlos como "próximamente" o simplemente deshabilitar los botones correspondientes. No lanzarán errores inesperados.

### Seguridad del token
- No almacenar el JWT en `localStorage` (vulnerable a XSS). Usar `SecureStorage` en mobile o cookies `httpOnly` en web.
- El token de Google (`idToken`) se usa solo para el login; el servidor lo descarta inmediatamente, nunca se persiste.
