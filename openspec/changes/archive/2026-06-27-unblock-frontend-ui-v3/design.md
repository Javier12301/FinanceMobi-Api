## Overview

Implement V3 as backend contract enablement for frontend features already present behind graceful degradation. The design favors minimal schema changes, owner-context authorization, and reuse of the existing transaction ledger rather than parallel balance logic.

## Architecture

Add vertical slices:

- `src/features/recurring`: schemas, service, controller, routes, and tests for recurring rules.
- `src/features/budgets`: schemas, service, controller, routes, and tests for monthly budgets.
- Extend `src/features/wallets` category code for metadata and update/delete.
- Extend `src/features/attachments` or Drive helpers for OAuth authorization URL and code exchange.

Protected owner-scoped endpoints must keep the existing chain:

`authMiddleware -> requireOwnerContext -> requireRole(...) -> controller`

`ASESOR` remains read-only. Mutating endpoints require owner or `SUPERVISOR`.

## Data Model

`RecurringRule` stores `ownerId`, `walletId`, nullable `destinationWalletId`, `categoryId`, `movementType`, decimal `amount`, nullable `description`, `dayOfMonth`, `frequency`, `autoPost`, `startDate`, nullable `endDate`, `nextRunDate`, `active`, timestamps, and relations.

`Budget` stores `ownerId`, `categoryId`, `month` as `YYYY-MM`, decimal `limit`, and timestamps. Enforce uniqueness for `(ownerId, categoryId, month)`.

`Category` gains nullable `icon` and `color`. Validate icon against the frontend lucide key catalog and color as hex.

## Recurring Execution

Use MVP lazy processing on reads:

- `GET /api/recurring-rules/pending` returns active rules with `nextRunDate <= now` and `autoPost=false`.
- Auto-post rules may be materialized during dashboard/login-oriented reads only if implementation can guarantee idempotency.
- `POST /api/recurring-rules/:id/confirm` creates one transaction through the existing transaction service, inside the same ACID balance mutation path, then advances `nextRunDate`.

Confirmation must be idempotent enough to avoid double-posting the same due occurrence. If a durable occurrence marker is needed, add it explicitly rather than relying only on timestamps.

## Drive OAuth

Prefer backend-managed authorization-code flow:

- `GET /api/drive/auth-url` returns a consent URL using `drive.file`, `access_type=offline`, and a CSRF/state value.
- `POST /api/drive/connect` accepts an authorization `code`, exchanges it server-side, encrypts the refresh token, creates/persists the Drive root folder, and returns success.

Do not log plaintext OAuth codes, tokens, or refresh tokens.

## Validation

Use Zod at route boundaries. Monetary input may arrive as number from the frontend, but responses should serialize decimal amounts as strings to match transaction conventions.

## Review Flow

Use TDD per checkpoint. Before every pause run `npx tsc --noEmit`, `npx vitest run`, and `openspec validate --all --strict --no-interactive`. Reports to the human must be in Spanish.
