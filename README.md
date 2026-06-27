# FinanceVier — Backend

API REST para gestión de finanzas personales. Maneja billeteras, transacciones, acceso delegado, sesiones JWT con revocación via Redis y almacenamiento de comprobantes en Google Drive.

> **Estado:** En desarrollo activo — Checkpoint 3 de 8 completado.

---

## Requisitos previos

- Node.js 20+
- Docker Desktop (para MySQL y Redis locales)
- Bruno (cliente HTTP para probar la API manualmente)

---

## Levantar el proyecto

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
# Linux/macOS
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Luego editá `.env` con tus valores locales. Lo mínimo que necesitás cambiar:

| Variable             | Qué es                         | Cómo obtenerla                  |
| -------------------- | ------------------------------- | -------------------------------- |
| `JWT_SECRET`       | Clave de firma de tokens        | Mínimo 32 caracteres aleatorios |
| `ENCRYPTION_KEY`   | Clave AES para tokens de Google | Exactamente 64 caracteres hex    |
| `GOOGLE_CLIENT_ID` | OAuth app ID                    | Google Cloud Console             |

**Generá secretos seguros así:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

El resultado son 64 caracteres hex — perfecto para `ENCRYPTION_KEY`. Para `JWT_SECRET` cualquier string de 32+ caracteres sirve.

> ⚠️ No regeneres `JWT_SECRET` entre reinicios. Hacerlo invalida todas las sesiones activas.

### 3. Levantar infraestructura (MySQL + Redis)

```bash
docker compose up -d
```

Verificar que los contenedores estén corriendo:

```bash
docker compose ps
```

### 4. Inicializar la base de datos

```bash
# Generar cliente Prisma
npx prisma generate

# Crear tablas (corre migraciones)
npm run db:migrate

# Cargar datos de referencia (tipos de billetera, etc.)
npm run db:seed
# Cargar cuentas correspondientes para el seed en el env, hay 
# dos una para autenticación de google y otra para login con emial y password
```

### 5. Iniciar el servidor

```bash
npm run dev
```

### 6. Verificar que todo funciona

```bash
curl http://localhost:3000/api/health
# → { "status": "ok" }
```

---

## Probar la API con Bruno

Abrí Bruno y cargá la carpeta:

```
bruno/financevier-backend/
```

Endpoints disponibles hoy (Checkpoint 3):

| Request          | Descripción                                      |
| ---------------- | ------------------------------------------------- |
| `Health`       | Verifica que el servidor responde                 |
| `Login`        | Autenticación con email + password               |
| `Google Login` | Login con Google`id_token`                      |
| `Logout`       | Cierra la sesión actual (revoca el JWT en Redis) |

> Los demás folders ya están mapeados pero devuelven 404 hasta que se implementen.

---

## Comandos útiles

```bash
# Desarrollo (hot reload)
npm run dev

# Tests
npm test

# Ver y editar la DB en el navegador
npm run db:studio

# Apagar contenedores
docker compose down

# Reset total de DB y Redis (borra todos los datos locales)
docker compose down -v
```

---

## Estado del proyecto

| Checkpoint | Alcance                                              | Estado       |
| ---------- | ---------------------------------------------------- | ------------ |
| CP1        | Estructura base, health endpoint, logging, errores   | ✅ Aprobado  |
| CP2        | Auth con JWT, Redis sessions, rate limiting          | ✅ Aprobado  |
| CP3        | Google SSO, cifrado AES-256-GCM para refresh tokens  | ✅ Aprobado  |
| CP4        | Delegación, roles, autorización RBAC + IDOR guards | ⏳ Pendiente |
| CP5        | Billeteras, categorías, lookups                     | ⏳ Pendiente |
| CP6        | Transacciones, balance atómico                      | ⏳ Pendiente |
| CP7        | Adjuntos, Google Drive                               | ⏳ Pendiente |
| CP8        | Docker + Nginx para despliegue                       | ⏳ Pendiente |

---

## Stack

- **Runtime:** Node.js + TypeScript
- **HTTP:** Express
- **ORM:** Prisma + MySQL
- **Cache/Sesiones:** Redis
- **Tests:** Vitest + Supertest
- **Infra local:** Docker Compose
- **HTTP Client:** Bruno
