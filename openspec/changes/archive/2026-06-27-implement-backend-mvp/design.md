## Overview

Implement the backend as a secure TypeScript Express API using vertical feature slices. The backend is responsible for authentication, delegated authorization, financial ledger consistency, Google Drive attachments, and deployment readiness.

## Architecture

### Runtime And Structure

- `src/server.ts`: process bootstrap and `app.listen`.
- `src/app.ts`: Express app creation, middleware registration, health route, and feature routes.
- `src/core/config`: environment parsing and validation.
- `src/core/database`: Prisma and Redis clients.
- `src/core/middlewares`: auth, validation, rate limit, ownership, logging, errors.
- `src/core/security`: JWT, password hashing, token encryption helpers.
- `src/features/auth`: credential login, Google login, logout.
- `src/features/delegations`: delegation CRUD and authorization helpers.
- `src/features/wallets`: wallet CRUD and balance reads.
- `src/features/categories`: categories and lookup access if approved for MVP.
- `src/features/transactions`: income, expense, transfer, edit/delete policy handling, audit history.
- `src/features/attachments`: Google Drive upload/list/delete policy handling.

### Database

Use Prisma migrations for MySQL. The model should include:

- `User`: email, name, password hash, Google ID, encrypted Google refresh token, Drive folder ID.
- `Role`: `SUPERVISOR`, `ASESOR`.
- `UserDelegation`: owner, delegated user, role, status if invitation flow is approved.
- `WalletType`, `MovementType`: controlled lookup data.
- `Wallet`: owner, type, metadata, `initialBalance`, `currentBalance`.
- `Category`: owner, movement type, name.
- `Transaction`: source wallet, optional destination wallet, category, amount, description, date, movement type or equivalent classification.
- `TransactionHistory`: modified user, action type, `oldSnapshot`, `newSnapshot`.
- `TransactionAttachment`: transaction, Google file ID, MIME type, upload timestamp.

If a field or table is needed to resolve an open question, stop and ask before locking the schema.

### Authentication And Sessions

- Password login verifies bcrypt hashes.
- Google login verifies `id_token` with Google and then issues the system JWT.
- JWT payload includes `sub`, `email`, and `jti`.
- Redis stores `session:{userId}:{jti}` with TTL matching JWT expiration.
- Auth middleware verifies JWT signature and Redis session existence.
- Logout deletes only the current `session:{userId}:{jti}` key.

### Authorization

Use this chain for protected resource endpoints:

`AuthMiddleware -> RBAC/Context Middleware -> OwnershipGuard -> Controller`

The active owner context must be explicit and validated. Until the request format is approved, do not invent a permanent API contract.

### Financial Ledger

- Use positive decimal amounts.
- Derive balance direction from movement type.
- Wrap transaction create/update/delete in Prisma database transactions.
- Lock affected wallet rows before balance mutation. If Prisma does not provide ergonomic row locking for the exact query, use a safe raw SQL query inside the transaction.
- Transfer affects source and destination wallets atomically and creates one transaction row.
- Edits and deletes must create audit history with full snapshots. If the product policy is unresolved, implement safe stubs that reject unsupported operations and document the blocker.

### Google Drive Attachments

- Request `drive.file` scope.
- Encrypt refresh tokens with AES-256-GCM using `ENCRYPTION_KEY`.
- Store only Google file IDs and metadata in MySQL.
- Create/persist root folder ID on first Drive linkage.
- Use Drive app properties for transaction/category traceability where supported.
- Do not accept arbitrary uploads until MIME type, size, and count limits are approved.

### Deployment

- Docker Compose includes MySQL, Redis, backend, frontend placeholder or integration point, and Nginx proxy as needed.
- MySQL and Redis require health checks.
- Backend health check calls `/api/health`.
- Redis uses `--appendonly yes`.
- Nginx forwards `/api/*` without stripping `/api` and sets forwarding headers.
- Host port exposure for MySQL/Redis/backend must be development-only.

## Security Decisions

- No plaintext third-party refresh tokens in DB or logs.
- No authorization by role alone; always verify resource ownership.
- No in-memory rate limit store for exposed auth endpoints.
- No direct stack traces in JSON responses.
- No irreversible financial deletion without approved policy.

## Human Review Flow

Tasks are grouped into checkpoints. The implementer must pause after each checkpoint, report in Spanish, and wait for review before continuing.
