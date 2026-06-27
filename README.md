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

## Deploy en VPS

El stack completo corre con Docker Compose. Nginx actúa como proxy reverso y sirve el frontend estático.

### Estructura en producción

```
VPS (puerto 80)
└── Nginx
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

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | `mysql://user:pass@mysql:3306/financevier` |
| `REDIS_URL` | `redis://redis:6379` |
| `JWT_SECRET` | Mínimo 32 chars aleatorios |
| `ENCRYPTION_KEY` | 64 chars hex — `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth credentials |
| `ALLOWED_ORIGINS` | Dominio del frontend, ej: `https://app.tudominio.com` |

**4. Build del frontend**

El frontend compilado debe estar en `./frontend/dist/` antes de levantar el compose (Nginx lo sirve desde ahí).

```bash
# Ejemplo — ajustar según dónde esté el repo del frontend
cd /opt/financevier-frontend && npm run build
cp -r dist /opt/financevier/frontend/dist
```

**5. Levantar**

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

**6. Verificar**

```bash
curl http://localhost/api/health
docker compose -f docker-compose.prod.yml ps
```

### SSL con Let's Encrypt (recomendado)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d tudominio.com
```

### Actualizar en producción

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Las migraciones se aplican automáticamente al reiniciar el contenedor (`prisma migrate deploy`).
