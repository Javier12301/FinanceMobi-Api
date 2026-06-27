# Plan - FinanceVier

# Objetivo

Desarrollar sistema de gestión de finanzas personales, accesible via web, que permita control de ingresos, gastos y múltiples billeteras (efectivo, bancos, billeteras virtuales)

## Sistema de Delegación

El sistema incluirá permisos cruzados donde usuario puede delegar acceso de su cuenta a otro usuario bajo dos roles:

- SUPERVISOR: permisos LECTURA y ESCRITURA (útil para gestionar finanzas familiar)
- ASESOR: permisos exclusivos LECTURA (útil para auditoría o consejos)

## Sistema de Adjunto y Almacenamiento Descentalizado (Google Drive API)

El sistema incluirá capacidad de adjuntar comprobantes de pago (fotografías o PDFs) a las transacciones para garantizar trazabilidad ante reclamos. Para asegurar escalabilidad a costo cero de infraestructura, se implementará arquitectura Bring Your Own Storage

- **Vinculación:** Cada usuario podrá enlazar su cuenta personal de Google Drive. El sistema colicitará el scope `drive.file`, garantizando por diseño que la aplicación solo tenga acceso a los archivos que ella misma genera, protegiendo privacidad de usuario
- **Gestión de Carpetas:** En la primera vinculación, el backen creará automáticamente directorio raiz (Comprobante Finanzas, como ejemplo) y persistirá el `folderId` en la base de datos para futuras escrituras, independientemente si usuario renombra carpeta
- **Trazabilidad (MetaData):** se utilizara Apps Properties nativa de API de Google Drive para estampar metadatos invisibles en cada archivo (como id transacción y categoría). la base de datos relacional MySQL solo almacenará `fileId` proporcionado por Google, manteniendo tabal `TransactionAttachment`
    
    ### FIX CIFRADO DE googleRefreshToken
    
    > Nueva Decisión tomada: El campo `googleRefreshToken` se cifra con AES-256-GCM antes de persistir en MySQL, usando una clave maestra del entorno.
    > 
    > 
    > **Bug que puede causar:** Guardado en texto plano, si la base de datos se filtra (dump, backup expuesto, SQL injection), el atacante obtiene tokens de larga duración con acceso real a los archivos de Drive de cada usuario. El scope `drive.file` limita qué archivos ve, pero el token sigue siendo un vector de acceso real.
    > 
    > **Buena práctica y qué permitirá:** AES-256-GCM está disponible en el módulo `crypto` nativo de Node, sin dependencias extra. La clave maestra vive en `.env` y nunca toca la DB. Si el DB se filtra, los tokens son ilegibles sin la clave. Es el patrón estándar para tokens de terceros en reposo.
    > 
    

## Autenticación y Seguridad (Custom JWT + Google OAuth+ Redis para manejar sesiones)

Sistema utilizará estrategia hibrida que combina JWT con el control de sesiones en memoria con Redis evitando muchas request a DB, permitiendo sesiones revocables al instante sin perder rendimiento.

**Mecanismos de ingresos:**

- Credenciales clásicas: Email y Contraseña hasheado con `bcrypt`
- OAuth 2.0 Google: Autenticación Google
- Permitir agregar más autenticadores a futuro para aprender

**Flujo Autenticación Google SSO**

- Cliente front gestiona pop-up Google y obtiene `id_token`
- Cliente envía `id_token` al backend
- Backend verifica el token con servidores de google y extrae `sub` y `email`
- Si usuario no existe, se registra automáticamente. Si existe, se lo identifica
- El backend descarta token de google, genera JWT propio de sistema y registra sesión en Redis

**Rol Redis**

- Creación: Al emitir JWT, backend guarda Redis una clave, ejemplo:`session:{userId}:{jti} #jti = JWT ID único por token` con metada de usuario y tiempo de vida TTL idéntico a expiración JWT.
    - jti al payload del JWT y lo usamos como discriminador. Logout solo borra clave específica
- Validación: cada request protegida, Middleware verifica firma JWT sea válida y clave exista en Redis
- Revocación (Logout): al cerrar sesión, backend elimina clave Redis `DELsession:userId` jwt del usuario queda invalidado instantáneamente, blindado ante robo de tokens.

### FIX Redis Session Key con JTI

> Nueva Decisión tomada: La clave de sesión en Redis pasa de `session:{userId}` a `session:{userId}:{jti}`, donde `jti` es un UUID único generado al emitir cada JWT.
> 
> 
> **Bug que puede causar:** Con `session:{userId}`, hacer logout desde un dispositivo borra la única clave existente e invalida **todas** las sesiones activas del usuario. Si tenés la app abierta en celular y en web, cerrar sesión en uno cierra ambas sin aviso.
> 
> **Buena práctica y qué permitirá:** Cada token emitido tiene su propio `jti` en el payload. Redis guarda una clave por sesión activa. El logout solo borra esa clave específica. También permite, a futuro, mostrar al usuario sus dispositivos activos y revocar sesiones individuales desde configuración.
> 

```tsx
// Antes
{ sub: userId, email }

// Después
{ sub: userId, email, jti: crypto.randomUUID() }
```

Cambio en REdis al crear/validar/revocar

```tsx
// Crear
await redis.set(`session:${userId}:${jti}`, JSON.stringify(sessionData), { EX: ttl });

// Validar (en AuthMiddleware)
const session = await redis.get(`session:${payload.sub}:${payload.jti}`);

// Revocar (logout)
await redis.del(`session:${payload.sub}:${payload.jti}`);
```

# Stack Tecnológico

## Frontend

REACT + VITE + Typescript + TanStack (Query/Router)

Libreria de diseño

`shadcn/ui` con Tailwind

## Backend

Mantenerse en TypeScript

- RunTime Node js
- Framework http: Express
- Lenguaje: Typescript obligatorio
- Base de Datos: MySQL
- ORM: Prisma para TypeScript genera tipos automáticamente y escribir consultas es mejor
- CAche y sesiones: Redis
- Infraestructura: Docker Compose + Nginx (Reverse Proxy)

# Arquitectura

## Backend

Vertical Slicing Feature - Driven

```
/backend
├── prisma/                  # Todo lo relacionado a tu base de datos
│   ├── schema.prisma        # Tus modelos de DB (Users, Wallets, Transactions)
│   ├── migrations/          # Historial de cambios de la DB
│   └── seed.ts              # Script para llenar la DB con datos falsos iniciales
├── src/
│   ├── core/                # El "corazón" técnico de tu app (Configuraciones globales)
│   │   ├── config/          # Variables de entorno parseadas (.env)
│   │   ├── database/        # Conexión instanciada a Prisma y Redis
│   │   ├── middlewares/     # AuthMiddleware, ErrorHandler, RateLimit
│   │   └── utils/           # Loggers, formateadores de fechas (cosas genéricas)
│   │
│   ├── features/            # AQUÍ VIVE TU LÓGICA DE NEGOCIO (Módulos independientes)
│   │   │
│   │   ├── auth/            # Módulo de Autenticación
│   │   │   ├── auth.controller.ts   # Recibe la request, llama al servicio, devuelve response
│   │   │   ├── auth.service.ts      # Lógica: Hashear password, generar JWT, guardar en Redis
│   │   │   ├── auth.routes.ts       # Definición de los endpoints (POST /login)
│   │   │   └── auth.schema.ts       # Validaciones con Zod (ej: email válido, password > 8)
│   │   │
│   │   ├── wallets/         # Módulo de Billeteras
│   │   │   ├── wallets.controller.ts
│   │   │   ├── wallets.service.ts   # Lógica: Crear billetera, calcular saldo actual
│   │   │   ├── wallets.routes.ts
│   │   │   ├── wallets.schema.ts
│   │   │   └── wallets.types.ts     # Interfaces de TypeScript específicas de Wallets
│   │   │
│   │   ├── transactions/    # Módulo de Gastos e Ingresos
│   │   │   └── ... (misma estructura)
│   │   │
│   │   └── delegations/     # Módulo para el sistema Supervisor/Asesor
│   │       └── ... (misma estructura)
│   │
│   ├── app.ts               # Configuración de Express/Hono (CORS, inyección de rutas)
│   └── server.ts            # Arranca el servidor (app.listen)
│
├── .env                     # Tus variables locales
├── docker-compose.yml       # Levanta Postgres, Redis, App, Nginx
├── package.json
└── tsconfig.json
```

## Frontend

```
/frontend
├── src/
│   ├── app/                 # Configuración de toda la app (Router, QueryProvider, AuthProvider)
│   ├── assets/              # Imágenes locales, íconos SVG
│   ├── components/          # 🧱 UI COMPARTIDA (Botones, Modales, Inputs genéricos)
│   │   ├── elements/        # Button.tsx, Input.tsx
│   │   └── layouts/         # MainLayout.tsx (Sidebar, Navbar)
│   ├── config/              # Constantes, Axios/Fetch instances, ENV vars
│   ├── hooks/               # Custom hooks genéricos (ej: useDebounce, useWindowSize)
│   ├── utils/               # Funciones puras (ej: formatCurrency, formatDate)
│   │
│   ├── features/            # 🚀 AQUÍ VIVE LA LÓGICA DE NEGOCIO (Igual que el back)
│   │   │
│   │   ├── auth/            # Todo lo de Login / Registro
│   │   │
│   │   ├── delegations/     # El selector de "¿De quién estoy viendo los datos?"
│   │   │
│   │   ├── wallets/         # Todo lo relacionado a las billeteras
│   │   │   ├── api/         # Hooks de TanStack Query (ej: useGetWallets.ts, useCreateWallet.ts)
│   │   │   ├── components/  # Componentes SOLO de wallets (ej: WalletCard.tsx)
│   │   │   ├── types/       # Interfaces TS (ej: Wallet.ts)
│   │   │   └── index.ts     # Barrel file (exporta solo lo público de este módulo)
│   │   │
│   │   └── transactions/    # Gastos, ingresos, transferencias
│   │
│   ├── pages/               # 🗺️ Ensamblaje de páginas (Cada archivo es una ruta de URL)
│   │   ├── DashboardPage.tsx
│   │   ├── WalletsPage.tsx
│   │   └── SettingsPage.tsx
│   │
│   ├── store/               # Zustand (Solo para estado global de UI)
│   │   └── useAppStore.ts   # Guarda quién es el usuario objetivo (ej: "Estoy viendo a mi mamá")
│   │
│   └── main.tsx             # Punto de entrada (React DOM render)
```

# Modelo de datos

El diseño de la base de datos está optimizado para lectura rápida y persistencia segura de datos, implementaremos los siguientes mecanismos

- **Desnormalización intencional de saldos actuales:** El saldo actual de cada cuenta `currentBalance` se almacena en la tabla `Wallet`. para evitar cuellos de botellas y condiciones de carrera en entornos de mucha concurrencia, las actualización de saldo se ejecutan mediante **Transacciones ACID con Bloqueo Exclusivo `FOR UPDATE`.**
    - Cuando se registra un movimiento, el motor de base de datos bloquea la fila de la billetera afectada, actualiza saldo, inserta registro en libro y libera bloqueo
    - Garantiza consistencia
    - Como este sistema permitirá que usuarios gestionen registros de otros usuarios, hay que manejar esta concurrencia
    
    Ejemplo
    
    ```sql
    START TRANSACTION;
    
    -- 1. Leemos el saldo actual y BLOQUEAMOS esa fila específica.
    -- Nadie más puede modificar el saldo de la Billetera #1 hasta que terminemos.
    SELECT currentBalance FROM Wallet WHERE id = 1 FOR UPDATE;
    
    -- 2. Insertamos el nuevo movimiento en el libro mayor (Ej. Un egreso de $50)
    INSERT INTO Transaction (walletId, categoryId, amount, date) 
    VALUES (1, 3, 50.00, NOW());
    
    -- 3. Actualizamos el saldo desnormalizado
    UPDATE Wallet 
    SET currentBalance = currentBalance - 50.00, updatedAt = NOW()
    WHERE id = 1;
    
    -- 4. Si todo salió bien, guardamos los cambios y liberamos el bloqueo.
    COMMIT;
    -- (Si algo falla, se hace un ROLLBACK y no pasa nada).
    ```
    
- **Gestión de Transferencias:** Las transferencias entre billeteras del mismo ecosistema se registran en una única fila dentro de la tabla `Transaction`. Se utiliza de columna principal `walletId` como origen (débito) y columna opcional `destinationWalletId` como destino (crédito). Simplifica modelo mental y evita naomalías
- **Registro de Auditoria:** El sistema es inmutable. Cualquier corrección sobre transacción no sobrescribe, en su lugar revierte y aplica los nuevos saldos dejando huella de quién modificó qué y cuando en tabla `TransactionHistory`

![image.png](image.png)

## DDL - DBDIAGRAM

```sql
// ==========================================
// 1. TABLAS DE CATÁLOGO (Lookup Tables)
// ==========================================
Table Role {
  id int [pk, increment]
  name varchar [not null, unique]
  description varchar
}

Table WalletType {
  id int [pk, increment]
  name varchar [not null, unique]
}

Table MovementType {
  id int [pk, increment]
  name varchar [not null, unique]
}

// ==========================================
// 2. TABLAS PRINCIPALES
// ==========================================
Table User {
  id int [pk, increment]
  email varchar [not null, unique]
  name varchar [not null]
  passwordHash varchar
  googleId varchar [unique]
  createdAt datetime
  updatedAt datetime
}

Table UserDelegation {
  id int [pk, increment]
  ownerId int [not null]
  delegatedId int [not null]
  roleId int [not null]
  createdAt datetime
}

Table Wallet {
  id int [pk, increment]
  userId int [not null]
  walletTypeId int [not null]
  name varchar [not null]
  description varchar
  initialBalance decimal(14,2) [not null]
  currentBalance decimal(14,2) [not null]
  createdAt datetime
  updatedAt datetime
}

Table Category {
  id int [pk, increment]
  userId int [not null]
  movementTypeId int [not null]
  name varchar [not null]
  createdAt datetime
}

// ==========================================
// 3. TRANSACCIONES Y AUDITORÍA
// ==========================================
Table Transaction {
  id int [pk, increment]
  walletId int [not null] 
  destinationWalletId int 
  categoryId int [not null] 
  amount decimal(14,2) [not null] 
  description varchar
  date datetime
}

Table TransactionHistory {
  id int [pk, increment]
  transactionId int [not null]
  modifiedByUserId int [not null] 
  actionType varchar [not null] 
  oldAmount decimal(14,2)
  newAmount decimal(14,2)
  createdAt datetime
}

Table TransactionAttachment {
  id int [pk, increment]
  transactionId int [not null]
  fileUrl varchar [not null]
  fileType varchar [not null]
  uploadedAt datetime
}

// ==========================================
// RELACIONES
// ==========================================
Ref: UserDelegation.ownerId > User.id [delete: cascade]
Ref: UserDelegation.delegatedId > User.id [delete: cascade]
Ref: UserDelegation.roleId > Role.id [delete: restrict]

Ref: Wallet.userId > User.id [delete: cascade]
Ref: Wallet.walletTypeId > WalletType.id [delete: restrict]

Ref: Category.userId > User.id [delete: cascade]
Ref: Category.movementTypeId > MovementType.id [delete: restrict]

Ref: Transaction.walletId > Wallet.id [delete: cascade]
Ref: Transaction.destinationWalletId > Wallet.id [delete: cascade]
Ref: Transaction.categoryId > Category.id [delete: restrict]

Ref: TransactionHistory.transactionId > Transaction.id [delete: cascade]
Ref: TransactionHistory.modifiedByUserId > User.id [delete: restrict]
Ref: TransactionAttachment.transactionId > Transaction.id [delete: cascade]
```

## DDL - MySQL

```sql
-- ==========================================
-- 1. TABLAS DE CATÁLOGO (Lookup Tables)
-- ==========================================

CREATE TABLE Role (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255) NULL
);
-- Ej: 'SUPERVISOR', 'ASESOR'

CREATE TABLE WalletType (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
-- Ej: 'EFECTIVO', 'CUENTA_BANCARIA', 'VIRTUAL'

CREATE TABLE MovementType (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
-- Ej: 'INGRESO', 'EGRESO', 'TRANSFERENCIA'

-- ==========================================
-- 2. TABLAS PRINCIPALES
-- ==========================================

CREATE TABLE User (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    passwordHash VARCHAR(255) NULL,
    googleId VARCHAR(255) NULL UNIQUE,
    googleRefreshToken VARCHAR(500) NULL, -- Necesario para subir cosas cuando el token expira
		-- ⚠ DECISIÓN: Este campo se almacena cifrado con AES-256-GCM.
		-- El cifrado/descifrado ocurre en la capa de servicio (auth.service.ts).
		-- Nunca se persiste el token en texto plano.
		driveFolderId VARCHAR(255) NULL, -- El ID de la carpeta maestra del usuario
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE UserDelegation (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ownerId INT NOT NULL,
    delegatedId INT NOT NULL,
    roleId INT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ownerId) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (delegatedId) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (roleId) REFERENCES Role(id) ON DELETE RESTRICT,
    UNIQUE (ownerId, delegatedId) 
);

CREATE TABLE Wallet (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    walletTypeId INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    initialBalance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    currentBalance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (walletTypeId) REFERENCES WalletType(id) ON DELETE RESTRICT
);

CREATE TABLE Category (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    movementTypeId INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (movementTypeId) REFERENCES MovementType(id) ON DELETE RESTRICT
);

-- ==========================================
-- 3. TRANSACCIONES Y AUDITORÍA
-- ==========================================

CREATE TABLE Transaction (
    id INT AUTO_INCREMENT PRIMARY KEY,
    walletId INT NOT NULL,
    destinationWalletId INT NULL, 
    categoryId INT NOT NULL,
    amount DECIMAL(14,2) NOT NULL CHECK (amount > 0), 
    description VARCHAR(255) NULL,
    date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (walletId) REFERENCES Wallet(id) ON DELETE CASCADE,
    FOREIGN KEY (destinationWalletId) REFERENCES Wallet(id) ON DELETE CASCADE,
    FOREIGN KEY (categoryId) REFERENCES Category(id) ON DELETE RESTRICT
);

CREATE TABLE TransactionHistory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transactionId INT NOT NULL,
    modifiedByUserId INT NOT NULL, 
    actionType VARCHAR(50) NOT NULL, 
    oldAmount JSON NULL,
    newAmount JSON NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transactionId) REFERENCES Transaction(id) ON DELETE CASCADE,
    FOREIGN KEY (modifiedByUserId) REFERENCES User(id) ON DELETE RESTRICT
);

-- ==========================================
-- 4. ADJUNTOS Y COMPROBANTES
-- ==========================================

CREATE TABLE TransactionAttachment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transactionId INT NOT NULL,
    googleFileId VARCHAR(500) NOT NULL, -- El enlace de Google Drive o nombre del archivo
    fileType VARCHAR(50) NOT NULL, -- Ej: 'application/pdf', 'image/jpeg'
    uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transactionId) REFERENCES Transaction(id) ON DELETE CASCADE
);
```

### FIX - SNAPSHOT COMPLETO

> Nueva Decisión tomada: Reemplazar las columnas `oldAmount`/`newAmount` por `oldSnapshot JSON` y `newSnapshot JSON`.
> 
> 
> **Bug que puede causar:** El esquema actual solo audita cambios de monto. Si alguien modifica la categoría, descripción, fecha o billetera de destino de una transacción, no queda ningún rastro de qué había antes. El sistema sería "inmutable" solo en monto, no en realidad.
> 
> **Buena práctica y qué permitirá:** Guardar el estado completo de la fila como JSON antes y después de cada modificación cubre cualquier campo presente y futuro sin requerir migraciones adicionales cuando se agreguen columnas a `Transaction`. También facilita mostrarle al usuario un diff completo de qué cambió.
> 

# Web and Mobile

## Arquitectura de Código único

El desarrollo frontend se gestionará bajo un paradigma de código único utilizando **React, Vite y TypeScript.** Significa que interfaz web será accesible desde cualquier navegador y aplicación móvil. Compartirán el 100% de lógica de negocio, manejo de estado y consumo de API.

El diseño visual debe ser **Mobile-First,** para garantizar experiencia UX e interfaz UI optimizadas para pantalas táctiles desde su inicio, escalando luego de manera responsiva para monitores de escritorio

### PANTALLAS A ADAPTAR

El sistema utilizará Mobile-First. El desarrollo iniciará diseñando para resoluciones pequeñas y mediante media queries o clases de utilidad, la interfaz se expandriá y adaptará a pantallas superiores

Rasngos de píxeles lógicos que el sistema debe soportar para garantizar experiencia de usuario fluida en cualquier hardware

| **Categoría de Dispositivo** | **Rango CSS (Ancho)** | **Casos de Uso Comunes** | **Comportamiento de la UI** |
| --- | --- | --- | --- |
| **Celulares Pequeños** | **320px - 375px** | iPhone SE, Androids de entrada antiguos. | Diseño en una sola columna. Menú hamburguesa obligatorio. Botones flotantes (FAB) para acciones principales. |
| **Celulares Grandes** | **376px - 430px** | iPhone 14/15 Pro Max, Samsung Galaxy S Ultra. | Tamaño base de diseño móvil. Mayor respiro (padding/margin) entre elementos. |
| **Tablets / Plegables** | **768px - 1024px** | iPad clásico, Galaxy Tab, celulares plegables. | Transición híbrida. Se pueden mostrar dos columnas simples o barras laterales ocultables. |
| **Notebooks Económicas** | **1280px - 1366px** | Laptops corporativas estándar o económicas (Resolución física 1366x768). | Interfaz de escritorio completa. Barra de navegación superior o panel lateral permanente. |
| **Notebooks Gama Alta** | **1440px - 1536px** | MacBooks, Laptops de desarrollador (Pantallas 2K/4K escaladas por el OS). | Optimización de espacios. Aprovechamiento de grillas complejas (ej. 3 columnas para dashboard). |
| **Monitores Estándar (FHD)** | **1920px** | Monitores comunes de 24" (Resolución 1920x1080). | Visualización expansiva. Cajas de contenido con ancho máximo centrado para no estirar los datos. |
| **Monitores Grandes (2K+)** | **2560px en adelante** | Monitores de 27" 2K, Pantallas Ultrawide o 4K nativas. | Máximo aprovechamiento de datos. El contenido no debe estirarse indefinidamente, sino agruparse en tarjetas centrales (`max-w-7xl` o similar). |

**Implementación Técnica de tamaños**

Utilizaremos un framework como Tailwind CSS, estos rangos se mapearán de manera automática con las clases de utilidad estándar de la industria, las cuales operan bajo Mobile-First

- **Por defecto (sin clase):** Aplica a celulares pequeños y grandes (0px - 639px).
- **`sm:` (640px+)** Punto de quiebre para Tablets.
- **`md:` (768px+)** Punto de quiebre para Tablets en horizontal / Laptops pequeñas.
- **`lg:` (1024px+)** Punto de quiebre para Laptops estándar (1366x768).
- **`xl:` (1280px+)** Punto de quiebre para Laptops gama alta.
- **`2xl:` (1536px+)** Punto de quiebre para Monitores Estándar y Grandes (FHD / 2K).

## Puente Nativo

Para distribución móvil, se implementará **Capacitor (desarrollado por Ionic).** Esto permite envolver la aplicación web compilada en un contenedor permiteindo generar binarios ejecutables para android `.apk` / `.aab` e iOS `.ipa`

Capacitor, permite a React comunicarse directamente con el hardware del dispositivo móvil

## Integración de Hardware

El uso de puente nativo habilitará las siguientes funcionalidades para futuras iteraciones:

- **Autenticación Biométrica**: ****Acceso rápido mediante huella o reconocimiento facial FaceID/TouchID utilizando plugins nativos, delegando manejo de sesión sin requerir contraseña en cada ingreso
- **Acceso a Cámara y Sistemas de Archivos:** Posibilidad futura de capturar comprobantes de pago y almacenar en el sistema, mejorando registro de egresos. También podría servir para hacer persistencia de comprobantes de pago y tener un registro historíco si alguna entidad quiere reclamar alguna deuda y no se tiene el comprobante, esto permitirá leer del sistema de archivos del celular y subir a la nube comprobantes de pago
- **Notificaciones Push:** Alertar nativas del SO para avisos de saldo bajo o recordatorios de vencimientos

## Problemas que pueden ocurrir

Tendremos problemas con la autenticación de google, en la wqeb se abre un pop-up. pero en apk no, google bloquea autenticación web tradicional por seguridad. 

Para solucionar esto

- Instalaremos un plugin `@capacitor-community/google-auth` este plugin detecta si se usa un celular y abre selector de cuentas nativo de Android (el mismo que usan todas las apps oficiales), haciendo que login sea un solo toque.

Libreria de UI

para que app no parezca página web metida a la fuerza, los botones, modales y transiciones tienen que sentirse táctiles.

Usaremos la libreria `shadcn/ui`

# Api

Nginx debe estar configurado para enrutar tráfico basándose prefijo de URL. 

## Estrategia de enrutamiento

Vamos a tener dos mundo bajo mismo dominio ejemplo `misfinanzas.com`

- [`misfinanzas.com/api/*`](http://misfinanzas.com/api/*) : todo lo que empiece así, Nginx lo redirige al contenedor del Backend
- [`misfinanzas.com/*`](http://misfinanzas.com/*) : todo lo demás, nginx lo redirige al contenedor del frontend para cargar aplicación

Esto es vital porque React maneja sus propias rutas con TanStack Router y no queremos que el servidor backend intente resolver ruta del frontend ni viceversa

## Configuración Típica en Nginx

La lógica de `nginx.conf` lo dejaríamos masomenos así

```
server {
    listen 80;

    # Backend: Todas las peticiones a /api van al contenedor del backend
location /api/ {
    proxy_pass http://backend:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

    # Frontend: Todo lo demás va al contenedor del frontend
    location / {
	    proxy_pass http://frontend:80;
	    try_files $uri $uri/ /index.html;
    }
}
```

### FIX

> Nueva Decisión tomada: Eliminé el trailing slash de `proxy_pass` en el bloque `/api/` y agregué headers de forwarding.
> 
> 
> **Bug que puede causar:** El trailing slash en `proxy_pass <http://backend:3000/`> hace que Nginx stripee el prefijo `/api/` antes de enviar la request. Una llamada a `/api/wallets` le llega al backend como `/wallets`, rompiendo todo el enrutamiento de Express silenciosamente.
> 
> **Buena práctica y qué permitirá:** Sin trailing slash, el path se reenvía íntegro. Los headers `X-Forwarded-For` y `X-Forwarded-Proto` son necesarios para que `pino-http` loguee la IP real del cliente (no la del proxy) y para que el backend sepa si la conexión original era HTTPS.
> 

> Nueva Decisión tomada: Agregué `try_files` al bloque del frontend para soportar navegación directa por URL.
> 
> 
> **Bug que puede causar:** Sin esto, si el usuario entra directo a `misfinanzas.com/wallets` o recarga la página, Nginx busca un archivo físico llamado `wallets`, no lo encuentra y devuelve **404**. TanStack Router vive en el cliente, Nginx no lo sabe.
> 
> **Buena práctica y qué permitirá:** `try_files` intenta servir el archivo real; si no existe, sirve siempre `index.html` y deja que React maneje la ruta. Esto aplica tanto para rutas directas como para F5 en cualquier página.
> 

## Módulos a trabajar

### Health endpoint

backend apunta a `GET /api/health`

```tsx
// En app.ts, antes de las rutas de features
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
```

### Módulo autenticación `/api/auth`

- `POST /api/auth/login` (Credenciales clásicas: Email/Pass)
- `POST /api/auth/google` (Recibe `id_token` de Google, registra/identifica y genera JWT/Redis)
- `POST /api/auth/logout` (Elimina sesión en Redis, invalida JWT)

### Módulo de Billeteras `/api/wallets`

- `GET /api/wallets` (Lista todas las billeteras del usuario logueado o delegadas)
- `POST /api/wallets` (Crear nueva billetera con saldo inicial)
- `PATCH /api/wallets/:id` (Editar nombre, tipo, etc.)
- `DELETE /api/wallets/:id` (Eliminar billetera)

### Módulo de Transacciones `/api/transactions`

- `GET /api/transactions` (Lista transacciones, ideal con filtros: `walletId`, `dateRange`, `categoryId`)
- `POST /api/transactions` (Registra un ingreso/gasto/transferencia. *Requiere lógica de bloqueo `FOR UPDATE`*)
- `PATCH /api/transactions/:id` (Modifica una transacción y actualiza saldos. *Requiere transacción ACID + historial*)
- `DELETE /api/transactions/:id` (Elimina una transacción y revierte saldos)

### Módulo de Delegación `/api/delegations`

- `GET /api/delegations` (Ver a quién delegué o quién me delegó)
- `POST /api/delegations` (Invitar a alguien como SUPERVISOR o ASESOR)
- `DELETE /api/delegations/:id` (Revocar acceso)

### Módulo de Adjuntos `/api/attachments`

- `POST /api/attachments/:transactionId` (Upload de comprobante, subida a Drive y creación de registro en DB)
- `GET /api/attachments/:transactionId` (Obtener lista de links de comprobantes)
- `DELETE /api/attachments/:id` (Elimina el registro y el archivo en Drive)

## Middlewares

### RateLimit

Vital para API expuesta a internet. Limitar cuántas peticiones puede hacer una misma IP en un tiempo determinado

- Evitar ataques de fuerza bruta con `/api/auth/login` proteger servidor de ser sobrecargado por bots
- Librerias posibles: `express-rate-limit`
    
    ### FIX RATE LIMIT
    
    > Nueva Decisión tomada: Configurar `express-rate-limit` con `rate-limit-redis` como store en lugar del store en memoria por defecto.
    > 
    > 
    > **Bug que puede causar:** El store en memoria guarda los contadores dentro del proceso de Node. Si en algún momento corrés más de una instancia del backend (o simplemente reiniciás el proceso), los contadores se resetean. Un atacante puede superar el límite reiniciando requests justo después de un deploy o haciendo requests alternadas entre instancias.
    > 
    > **Buena práctica y qué permitirá:** Al usar Redis como store, los contadores son compartidos y persisten entre reinicios. Ya tenés Redis en el stack, no agrega infraestructura. Además, el rate limit diferenciado por endpoint (más estricto en `/api/auth/login`, más permisivo en el resto) se vuelve trivial de implementar.
    > 
    
    Librería a agregar `rate-limit-redis`
    
    ```tsx
    import rateLimit from 'express-rate-limit';
    import RedisStore from 'rate-limit-redis';
    
    export const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,  // 15 minutos
        max: 10,                    // 10 intentos por ventana
        store: new RedisStore({
            sendCommand: (...args: string[]) => redis.sendCommand(args)
        })
    });
    
    // Uso: router.post('/login', authLimiter, authController.login)
    ```
    

### ValidationMiddleware

En lugar de validar manualmente [`req.body.email`](http://req.body.email) y `req.body.amount` en cada controlador usar middleware que valida todo contra un esquema de Zod.

- Garantizar que `amount` sea número positivo, que `email` sea válido y que no falten campos antes de que la petición llegue a la lógica de negocio. Si el esquema no coincide, el middleware corta petición ahí mismo y devuelve error 400.

### AuthMiddleware

Verificar que usuario esté logueado (JWT + Redis). Pero para sistema de delegación, quizas necesitemos una extesión o segundo middleware de autorización

- `RBACMIddleware` (Role Based Access Control): una vez que usuario está logueado, el middleware chequea si tiene permisos para ejecutar acción específica sobre una billetera.
    - Ejemplo: Si transacción intenta edita rbilletera, el middleware consulta si usaurio es dueño o si es supervisor en tabla `UserDelegation`
    
    ### FIX
    
    > Nueva Decisión tomada: Agregar un tercer middleware `OwnershipGuard` en la cadena de autorización, después de `RBACMiddleware`.
    > 
    > 
    > **Bug que puede causar:** `RBACMiddleware` verifica que el usuario tiene un rol delegado, pero no verifica que la billetera (o transacción) que está intentando modificar pertenece al `ownerId` de esa delegación. Sin este guard, un SUPERVISOR de un usuario podría intentar acceder a billeteras de otro usuario completamente distinto si adivina el `walletId`.
    > 
    > **Buena práctica y qué permitirá:** El guard resuelve el `walletId` del request contra la DB, extrae su `userId`, y verifica que coincida con el contexto activo (usuario propio o dueño de la delegación vigente). Cierra el vector de IDOR (Insecure Direct Object Reference), que es uno de los bugs más comunes en APIs con multi-tenancy.
    > 
    
    ```tsx
    AuthMiddleware → RBACMiddleware → OwnershipGuard → Controller
    ```
    

### RequestLogger

Middleware que registra petición entrante: métodos, URL, IP y tiempo de ejecución

- Cuando algo falle en producción, miramois los logs y vemos lo que fallo.
    - Ejemplo: Una transacción falló porque usuario X intentó editar a las 3:00 AM desde una ip bloqueada
- Libreria posible `pino-http`

### ErrorHandler

Middleware para manejo de errores, si algo falla este lo atrapa, lo loguea y responde con JSON para el front

# Despliegue (Docker)

Para el sistema, definiremos 5 servicios

- `mysql`
    - Base de datos
- `redis`
    - Manejar caché de sesiones u otras cosas
- `backend`
    - Servidor Node.js express. Esperará que base dedatos esté lista ante de arrancar
- `frontend`
    - Servido mediante un servidor web Nginx.
    - Planificar bien esto para primeras versiones si conviene hacer build local o mandar todo a docker
- `proxy`
    - Punto de entrada que distribuye tráfico

**Cadena de healthchecks** — el orden de arranque forzado es `mysql → redis → backend → frontend → proxy`. Ningún servicio arranca hasta que el anterior confirmó estar sano.

### FIX

> Nueva Decisión tomada: Reemplazé el `depends_on` simple por uno con `condition: service_healthy` y agregué healthcheck al servicio `mysql`.
> 
> 
> **Bug que puede causar:** `depends_on` por defecto solo espera que el *contenedor* arranque, no que MySQL esté listo para aceptar conexiones. En el primer boot, Prisma intenta conectarse mientras MySQL todavía está inicializando su datadir y lanza un error fatal, impidiendo que el backend levante.
> 
> **Buena práctica y qué permitirá:** `service_healthy` hace que Docker espere activamente a que el healthcheck pase antes de iniciar el servicio dependiente. `mysqladmin ping` es el check estándar recomendado por la imagen oficial de MySQL.
> 

```yaml
mysql:
  healthcheck:
    test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
    interval: 10s
    timeout: 5s
    retries: 5

backend:
  depends_on:
    mysql:
      condition: service_healthy
    redis:
      condition: service_started
```

**`start_period`** — MySQL y el backend tienen un margen extra al primer boot. MySQL necesita inicializar el datadir la primera vez, y el backend necesita que Prisma corra las migrations antes de estar listo para responder.

**Redis con `--appendonly yes`** — persiste el log en disco. Si el contenedor se reinicia, las sesiones activas sobreviven al restart (en lugar de perder todas las sesiones cada vez que Docker reinicia Redis).

**Puertos de MySQL y Redis comentados como "solo desarrollo"** — en producción esos puertos no deberían estar expuestos al host. El único puerto público es el `80` del proxy.

**Health endpoint del backend** — el healthcheck de backend apunta a `GET /api/health`. Necesitás agregar ese endpoint mínimo en Express:

Docker Compose

```tsx
version: "3.9"

# ==========================================
# REDES
# ==========================================
networks:
  financevier_net:
    driver: bridge

# ==========================================
# VOLÚMENES PERSISTENTES
# ==========================================
volumes:
  mysql_data:
  redis_data:

# ==========================================
# SERVICIOS
# ==========================================
services:

  # ------------------------------------------
  # 1. BASE DE DATOS — MySQL
  # ------------------------------------------
  mysql:
    image: mysql:8.0
    container_name: financevier_mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE}
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - financevier_net
    healthcheck:
      # Espera a que MySQL esté listo para aceptar conexiones reales
      # (el contenedor puede estar "up" pero MySQL todavía inicializando)
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s   # Le da margen en el primer boot cuando inicializa el datadir
    # Puerto expuesto solo para desarrollo local (herramientas como DBeaver/TablePlus)
    # En producción: comentar o eliminar este bloque
    ports:
      - "3306:3306"

  # ------------------------------------------
  # 2. CACHÉ Y SESIONES — Redis
  # ------------------------------------------
  redis:
    image: redis:7-alpine
    container_name: financevier_redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - financevier_net
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
    # Puerto expuesto solo para desarrollo local
    # En producción: comentar o eliminar este bloque
    ports:
      - "6379:6379"

  # ------------------------------------------
  # 3. BACKEND — Node.js + Express
  # ------------------------------------------
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: financevier_backend
    restart: unless-stopped
    env_file:
      - ./backend/.env
    environment:
      DATABASE_URL: mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@mysql:3306/${MYSQL_DATABASE}
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      NODE_ENV: production
    networks:
      - financevier_net
    depends_on:
      mysql:
        condition: service_healthy    # Espera healthcheck de MySQL antes de arrancar
      redis:
        condition: service_healthy    # Espera healthcheck de Redis antes de arrancar
    healthcheck:
      # Verifica que Express esté levantado y respondiendo
      test: ["CMD-SHELL", "curl -f http://localhost:3000/api/health || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 20s   # Le da tiempo a Prisma para correr migrations al arrancar
    # Puerto expuesto solo para desarrollo local
    # En producción el tráfico entra por el proxy, no directamente
    ports:
      - "3000:3000"

  # ------------------------------------------
  # 4. FRONTEND — React (build estático servido por Nginx interno)
  # ------------------------------------------
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: financevier_frontend
    restart: unless-stopped
    networks:
      - financevier_net
    depends_on:
      backend:
        condition: service_healthy    # No sirve la app si el backend no está listo
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:80 || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
    # Sin puerto expuesto: el tráfico entra ÚNICAMENTE a través del proxy

  # ------------------------------------------
  # 5. REVERSE PROXY — Nginx
  # ------------------------------------------
  proxy:
    image: nginx:alpine
    container_name: financevier_proxy
    restart: unless-stopped
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    ports:
      - "80:80"
      # - "443:443"   # Descomentar cuando agregues SSL/TLS (Let's Encrypt / Certbot)
    networks:
      - financevier_net
    depends_on:
      frontend:
        condition: service_healthy
      backend:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "nginx -t || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
```

Para primer despliegue una VPS para uso en cualquier parte, al menos para uso personal por ahora

```
# ─── MySQL ────────────────────────────────────────────────────────────────────
# Usuario y base de datos que crea Docker automáticamente al primer boot
MYSQL_ROOT_PASSWORD=reemplazar-password-root-seguro
MYSQL_DATABASE=financevier
MYSQL_USER=financevier_user
MYSQL_PASSWORD=reemplazar-password-seguro

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_PASSWORD=reemplazar-password-redis-seguro

# ─── Backend — Express ────────────────────────────────────────────────────────
PORT=3000
NODE_ENV=production

# ─── JWT ──────────────────────────────────────────────────────────────────────
# Mínimo 32 caracteres. Generá uno con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=reemplazar-minimo-32-caracteres
# Tiempo de expiración del access token
JWT_EXPIRES_IN=15m
# Tiempo de vida de la sesión en Redis (debe coincidir con JWT_EXPIRES_IN en segundos)
SESSION_TTL_SECONDS=900

# ─── Google OAuth ─────────────────────────────────────────────────────────────
# Credenciales desde: https://console.cloud.google.com → APIs & Services → Credentials
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ─── Google Drive — Cifrado de Refresh Token ──────────────────────────────────
# Clave AES-256-GCM para cifrar googleRefreshToken en DB (32 bytes en hex)
# Generá uno con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=reemplazar-32-bytes-hex

# ─── CORS ─────────────────────────────────────────────────────────────────────
# En desarrollo: http://localhost:5173
# En producción: dominio real de la app
CORS_ORIGIN=https://misfinanzas.com

# ─── Frontend — Vite ──────────────────────────────────────────────────────────
# URL base de la API consumida por el frontend
# En desarrollo apuntar a http://localhost:3000
VITE_API_BASE_URL=https://misfinanzas.com/api
```

# FLUJO DE DESARROLLO

```
Desarrollo local  →  Funciona completo en local  →  Alquilar VPS  →  Apuntar dominio  →  Certbot SSL  →  docker compose up
```

# Flujo autenticación

![ChatGPT Image 26 jun 2026, 12_55_35 p.m. (4).png](ChatGPT_Image_26_jun_2026_12_55_35_p.m._(4).png)

El usuario puede acceder al sistema de dos formas: mediante email y contraseña, o usando Google SSO.

- En el registro tradicional, el usuario completa sus datos básicos, como nombre, email y contraseña. El sistema valida la información, crea la cuenta y permite iniciar sesión.
- En el login con email, el usuario ingresa sus credenciales. El backend valida la contraseña y, si los datos son correctos, genera una sesión mediante JWT. Esa sesión queda registrada en Redis para poder controlar el acceso activo.
- En el login con Google, el usuario selecciona la opción de Google. Google devuelve un token de identidad, el backend lo valida y luego busca si el usuario ya existe. Si no existe, puede crear la cuenta automáticamente. Finalmente, también se genera un JWT y se guarda la sesión en Redis.

Cuando el usuario cierra sesión, el sistema elimina la clave correspondiente en Redis y finaliza la sesión activa.

# FLUJO DE USUARIO

FinanceVier permite que una persona gestione sus finanzas personales desde una cuenta propia. El usuario puede registrarse, iniciar sesión, crear billeteras, registrar movimientos, consultar saldos, adjuntar comprobantes y administrar accesos delegados.

El sistema contempla tres tipos de usuario:

**Usuario propietario:** es la persona dueña de la cuenta. Puede administrar sus billeteras, movimientos, comprobantes, cuenta personal, Google Drive y delegaciones.

**Supervisor:** es un usuario invitado por el propietario para ayudar a gestionar la cuenta. Puede ver la información y también realizar acciones operativas, como cargar movimientos o administrar billeteras, según los permisos definidos.

**Asesor:** es un usuario invitado con acceso más limitado. Puede consultar información de la cuenta delegada, revisar movimientos y saldos, pero no realiza acciones de edición o eliminación.

![ChatGPT Image 26 jun 2026, 12_55_34 p.m. (1).png](ChatGPT_Image_26_jun_2026_12_55_34_p.m._(1).png)

Una vez autenticado, el usuario accede al dashboard principal. Desde ahí puede ver su balance total, los ingresos y gastos del mes, sus billeteras y las últimas transacciones registradas.

- El usuario puede crear una billetera indicando nombre, tipo y saldo inicial. Por ejemplo, puede cargar una billetera de efectivo, una cuenta bancaria o una billetera virtual.
- Luego puede registrar movimientos financieros. Estos movimientos pueden ser gastos, ingresos o transferencias entre billeteras. Cada movimiento actualiza los saldos correspondientes.
- También puede consultar el historial de movimientos, aplicar filtros por billetera, tipo o período, y revisar el detalle de cada transacción.

## Flujo de Billeteras

El usuario puede ver todas sus billeteras desde la sección correspondiente. Cada billetera muestra su nombre, tipo y saldo actual.

Desde esta pantalla, el usuario puede crear una nueva billetera, editar una existente o eliminarla. Antes de eliminar una billetera, el sistema solicita confirmación para evitar borrados accidentales.

Las billeteras se utilizan como origen o destino de los movimientos financieros. Por eso, cada gasto, ingreso o transferencia queda asociado a una o más billeteras.

# Flujo de Transacciones

El flujo comienza cuando el usuario abre el registro rápido de movimiento.

Primero selecciona el tipo de transacción:

**Gasto:** representa una salida de dinero desde una billetera. El usuario carga el monto, selecciona la billetera, la categoría, una descripción opcional y la fecha.

**Ingreso:** representa una entrada de dinero. El usuario carga el monto, selecciona la billetera donde ingresa el dinero, la categoría, una descripción opcional y la fecha.

**Transferencia:** representa un movimiento entre dos billeteras propias. El usuario indica el monto, la billetera de origen y la billetera de destino.

En los gastos e ingresos, el usuario puede adjuntar un comprobante de manera opcional. Si adjunta un archivo o imagen, el sistema lo asocia a la transacción.

Al confirmar la operación, el frontend envía la información al backend mediante `POST /api/transactions`. El backend guarda la transacción y actualiza los saldos de forma segura, evitando inconsistencias cuando hay operaciones simultáneas.

![ChatGPT Image 26 jun 2026, 12_55_35 p.m. (2).png](ChatGPT_Image_26_jun_2026_12_55_35_p.m._(2).png)

# Flujo de Delegación

El propietario de la cuenta puede invitar a otra persona para que gestione o consulte su información financiera.

Desde Ajustes, el propietario ingresa el email del delegado y selecciona un rol: Supervisor o Asesor. El sistema envía la invitación y registra la delegación.

El delegado recibe la invitación y puede aceptarla o rechazarla. Si la acepta, la cuenta delegada queda disponible para ser consultada desde su propio usuario.

Cuando el delegado cambia de contexto, el sistema muestra la información de la cuenta del propietario. En ese modo, las acciones disponibles dependen del rol asignado.

El Supervisor puede consultar y operar sobre la cuenta delegada, incluyendo movimientos y billeteras. El Asesor puede consultar la información, pero no tiene permisos de edición o eliminación.

El propietario puede revocar el acceso en cualquier momento. Al revocar, el delegado pierde el acceso a esa cuenta.

![ChatGPT Image 26 jun 2026, 12_55_35 p.m. (3).png](ChatGPT_Image_26_jun_2026_12_55_35_p.m._(3).png)

# Flujo Google Drive

El usuario puede vincular su cuenta con Google Drive desde Ajustes.

Cuando selecciona “Conectar Drive”, el sistema inicia el flujo OAuth de Google. Si el usuario concede permisos, el backend guarda el estado de conexión.

Si es la primera vez que el usuario conecta Drive, el sistema puede crear una carpeta raíz para organizar los comprobantes de FinanceVier.

Una vez vinculada la cuenta, los comprobantes adjuntos a las transacciones pueden subirse a Google Drive. El sistema guarda la metadata del archivo y el `fileId` devuelto por Google, para poder asociarlo luego a la transacción correspondiente.

Si el usuario decide desconectar Drive, el sistema solicita confirmación y luego elimina o desactiva la vinculación.

![ChatGPT Image 26 jun 2026, 12_55_36 p.m. (5).png](ChatGPT_Image_26_jun_2026_12_55_36_p.m._(5).png)

## Flujo de Comprobantes

Al registrar un gasto o ingreso, el usuario puede adjuntar un comprobante desde la cámara, galería o archivo local.

Si el usuario no adjunta comprobante, la transacción se guarda normalmente.

Si adjunta comprobante, el sistema sube el archivo, guarda sus datos y lo vincula con la transacción. Luego, desde el detalle del movimiento, el usuario puede ver el comprobante asociado.

Este flujo permite mantener respaldo documental de gastos, ingresos o movimientos importantes sin obligar al usuario a cargar comprobantes en todos los casos.