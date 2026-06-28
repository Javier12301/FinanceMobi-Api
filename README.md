# FinanceVier — Backend

API REST en TypeScript/Express para la app de finanzas personales.

## Desarrollo local

### Requisitos

- Node 22+
- Docker Desktop

### Arrancar

```bash
docker compose up -d          # MySQL + Redis
cp .env.example .env          # completar variables
npm install
npm run db:migrate
npm run db:seed
npm run dev                   # http://localhost:3000
```

### Comandos útiles

```bash
npm run test          # tests
npx tsc --noEmit      # type check
npm run db:studio     # Prisma Studio
```

---

## Deploy en maquina propia para red interna

Este modo sirve para probar la API desde otros dispositivos conectados a la misma red local, por ejemplo un celular o notebook familiar. No expone la app a internet.

### 1. Obtener la IP local de la maquina

En Windows:

```powershell
ipconfig
```

Buscar la `Direccion IPv4` del adaptador Wi-Fi o Ethernet. Ejemplo:

```text
192.168.0.249
```

### 2. Configurar variables de entorno

Para desarrollo normal, dejar `.env` cerrado a localhost:

```env
PORT=3000
ALLOWED_ORIGINS=http://localhost:5173
```

El comando `npm run dev:lan` habilita CORS para origenes privados de red local en el puerto `5173`, por ejemplo `http://192.168.0.249:5173`, sin tener que cambiar el `.env` cada vez que cambia la IP.

### 3. Levantar base de datos y Redis

```bash
docker compose up -d
npm run db:migrate
```

Opcionalmente, cargar datos iniciales:

```bash
npm run db:seed
```

### 4. Levantar en modo local

```bash
npm run dev
```

Este modo escucha solo en la propia maquina:

```text
http://localhost:3000/api
```

### 5. Levantar en modo red interna

Backend:

```bash
npm run dev:lan
```

Frontend, desde el repo frontend:

```bash
npm run dev:lan
```

Abrir desde el celular o desde otro equipo de la misma red:

```text
http://192.168.0.249:5173
```

En modo LAN, el frontend calcula la API usando el mismo host con puerto `3000`, por ejemplo:

```text
http://192.168.0.249:3000/api
```

Para verificar:

```bash
curl http://192.168.0.249:3000/api/health
```

### 6. Firewall

Si Windows pide permiso para Node.js, permitir acceso en redes privadas. Si no aparece el aviso y otro dispositivo no puede conectarse, habilitar el puerto `3000` en el firewall para red privada.

---

## Deploy por Tailscale (testing privado con SSO)

Este modo levanta el **stack completo** (igual que producción) en tu PC y lo
expone solo a tu red Tailscale, con **HTTPS real** y **Google SSO funcionando**.
Ideal para que un grupo de gente conocida pruebe la app antes de pagar un VPS.
Solo quien esté en tu tailnet puede entrar.

### Por qué Tailscale y no LAN a secas

Google OAuth rechaza orígenes que sean una IP (`192.168.x.x`). Tailscale te da un
nombre de dominio real (`*.ts.net`) con certificado Let's Encrypt válido, así que
el botón de Google funciona. En LAN pura el SSO no anda.

### Arquitectura

```
Amigos en la tailnet
        │  https://desktop-j3kad53.hornbill-adder.ts.net
        ▼
Tailscale Serve  (termina el TLS, cert automático *.ts.net)
        │  http://localhost:80
        ▼
Caddy  ├── /api/*  →  backend Express :3000
       └── /*      →  frontend SPA (../frontend/dist)
```

### Requisitos (una sola vez)

1. **Tailscale** instalado y logueado en tu PC y en los dispositivos de quienes prueben,
   todos en la misma tailnet (`hornbill-adder.ts.net`).
2. En el **admin de Tailscale** → DNS: activar **MagicDNS** y **HTTPS Certificates**.
3. En **Google Cloud Console** (OAuth client `171866358561-...`), agregar:
   - *Authorized JavaScript origins*: `https://desktop-j3kad53.hornbill-adder.ts.net`
   - *Authorized redirect URIs*: `https://desktop-j3kad53.hornbill-adder.ts.net/auth/drive/callback`

> El nombre `desktop-j3kad53.hornbill-adder.ts.net` ya está cargado en `Backend/.env`
> (`ALLOWED_ORIGINS`, `GOOGLE_REDIRECT_URI`, `DOMAIN=:80`) y en `frontend/.env`
> (`VITE_API_BASE_URL`). Si cambiás de PC, actualizá esos cuatro valores.

### Levantar

```bash
# 1. Build del frontend (Caddy lo sirve desde ../frontend/dist)
cd frontend
npm install
npm run build

# 2. Stack completo: MySQL + Redis + backend + Caddy
cd ../Backend
docker compose -f docker-compose.prod.yml up -d --build

# 3. (primera vez) crear tu cuenta CREADOR y datos base
docker compose -f docker-compose.prod.yml exec backend npm run db:seed

# 4. Exponer Caddy (:80) a la tailnet con HTTPS automático
tailscale serve --bg 80
```

`tailscale serve status` te muestra la URL pública dentro de la tailnet.
La sintaxis de `serve` cambió entre versiones de Tailscale; si `--bg 80` falla,
revisá `tailscale serve --help` (alternativa común: `tailscale serve https / http://localhost:80`).

### Usar

Cualquiera en la tailnet abre:

```text
https://desktop-j3kad53.hornbill-adder.ts.net
```

Se registran (el registro está abierto: `REGISTRATION_ENABLED=true`), prueban SSO, etc.

### Apagar / liberar

```bash
tailscale serve --https=443 off          # deja de exponer
docker compose -f docker-compose.prod.yml down   # baja el stack (los datos quedan en los volúmenes)
```

### Pasar a producción cuando esté ok

Es el **mismo `docker-compose.prod.yml`**. En el VPS solo cambia:
`DOMAIN=:80` → tu dominio real (Caddy saca el SSL solo), se quita `tailscale serve`,
y se actualizan los orígenes en Google Console al dominio final. Ver siguiente sección.

---

## Deploy en VPS

El stack completo corre con Docker Compose. **Caddy** actúa como proxy reverso,
sirve el frontend estático y **gestiona el SSL automáticamente** (Let's Encrypt).

### Estructura en producción

```
VPS (puertos 80 + 443)
└── Caddy  (SSL automático para DOMAIN)
    ├── /api/*  →  backend Express :3000
    └── /*      →  frontend SPA (build estático)
```

### Pasos

**1. Preparar el servidor**

```bash
# En la VPS (Ubuntu/Debian)
apt update && apt install -y docker.io docker-compose-plugin curl
```

**2. Subir el código**

```bash
git clone <repo> /opt/financevier
cd /opt/financevier
```

**3. Configurar variables de entorno**

```bash
cp .env.example .env
nano .env
```

Variables críticas para producción:

| Variable                                        | Descripción                                           |
| ----------------------------------------------- | ------------------------------------------------------ |
| `DATABASE_URL`                                | `mysql://user:pass@mysql:3306/financevier`           |
| `REDIS_URL`                                   | `redis://redis:6379`                                 |
| `JWT_SECRET`                                  | Mínimo 32 chars aleatorios                            |
| `ENCRYPTION_KEY`                              | 64 chars hex —`openssl rand -hex 32`                |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth credentials                                      |
| `ALLOWED_ORIGINS`                             | Dominio del frontend, ej:`https://app.tudominio.com` |
| `DOMAIN`                                       | Tu dominio real, ej:`app.tudominio.com` (Caddy saca el SSL para este host) |

Apuntá el DNS (registro A) de `DOMAIN` a la IP del VPS antes de levantar, o Caddy
no podrá emitir el certificado.

**4. Build del frontend**

El frontend compilado debe estar en `../frontend/dist/` (junto al repo) antes de
levantar el compose; Caddy lo sirve desde ahí.

```bash
cd frontend && npm install && npm run build
```

**5. Levantar**

```bash
cd Backend
docker compose -f docker-compose.prod.yml up -d --build
```

**6. Verificar**

```bash
curl https://tudominio.com/api/health
docker compose -f docker-compose.prod.yml ps
```

### SSL

Automático. Caddy emite y renueva el certificado de Let's Encrypt para `DOMAIN`
en cuanto el dominio resuelve a la IP del VPS. No hay que correr certbot ni nada.

### Actualizar en producción

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Las migraciones se aplican automáticamente al reiniciar el contenedor (`prisma migrate deploy`).
