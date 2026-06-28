## Convention note — IDs

All existing models in this repo use `@id @default(uuid())`. The new models introduced in V4 (`Debt`, `NotificationDevice`, `NotificationPreference`) follow this same convention. The pre-implementation spec mentioned `cuid()` but that contradicts the established pattern. Decision: **use `uuid()` throughout for consistency.** Migrations already applied — no change needed.

## Overview

Implement V4 as a retention-focused backend layer on top of the V3 contract. The design keeps the backend conservative: seed onboarding data at registration, compute stats/insights from existing transactions, reuse the ledger for debt payments, and avoid introducing a second scheduler or balance path.

## Architecture

Add vertical slices:

- `src/features/stats`: authenticated user activity stats.
- `src/features/debts`: schemas, service, controller, routes, and tests for debts/loans.
- `src/features/notifications`: device tokens, notification preferences, and testable notification candidate calculation.
- `src/features/insights`: monthly owner-scoped summaries.

Extend existing slices:

- `src/features/auth`: call onboarding seed creation after user creation, inside the same registration transaction when practical.
- `src/features/transactions`: add validated query filters and paginated response support.
- `src/features/recurring`: optionally link installment debts to recurring rules.

Protected owner-scoped endpoints must keep the existing chain:

`authMiddleware -> requireOwnerContext -> requireRole(...) -> controller`

User-only endpoints under `/api/me/*` use the authenticated user identity and must not accept `X-Owner-Id`.

## Data Model

`Debt` stores `ownerId`, `direction`, `counterparty`, nullable `categoryId`, decimal `principal`, decimal `remaining`, nullable `recurringRuleId`, nullable installment counts, nullable `dueDate`, `status`, nullable `notes`, and timestamps.

`NotificationDevice` stores the authenticated `userId`, `token`, `platform`, and timestamps. Tokens must be unique per user and deletable by exact token path parameter.

`NotificationPreference` stores `userId`, booleans for daily, budget, and recurring alerts, plus `reminderHour` as `HH:mm`. Defaults are enabled daily reminders at `21:00`, budget alerts enabled, and recurring alerts enabled.

Prisma identifiers remain `String @id @default(cuid())` unless the existing schema uses a different local convention. `NotificationDevice` must allow multiple devices per user by using a composite uniqueness rule such as `@@unique([userId, token])`, not `userId @unique`.

## Onboarding Seed

Registration seeds one `Efectivo` wallet with balance `0` and the default category catalog from `frontend-pendientes-v4.md`. The operation must be idempotent for retries and must not recreate data if the owner already has wallets/categories.

## Debt Payments

`POST /api/debts/:id/pay` must call or share the same ACID balance mutation path used by manual transaction creation. It creates an `EXPENSE` when `direction=I_OWE` and an `INCOME` when `direction=OWED_TO_ME`, decrements `remaining`, increments `installmentsPaid` when applicable, advances `dueDate` for installment debts, and marks the debt `PAID` at zero remaining.

The submitted `walletId` must belong to the active owner context. Avoid nested Prisma transactions: if the current transaction service opens its own `$transaction`, extract or add a transaction-aware helper so wallet balance mutation and debt state mutation commit or roll back together.

## Insights And Stats

Start with calculated queries rather than denormalized counters. If performance becomes a problem later, add denormalized fields behind a separate OpenSpec change. Month filtering must use owner-local calendar boundaries consistently with transaction timestamps.

`GET /api/transactions` must preserve the V3 array response only when no query parameters are provided. When any filter, search, or pagination query parameter is present, return the V4 envelope `{ items, total, page, pageSize }`, defaulting `page` and `pageSize` when omitted.

## Validation

Use Zod at route boundaries. Monetary input may arrive as numbers from the frontend; responses should serialize decimal amounts as strings. UUID, ISO date, `YYYY-MM`, and `HH:mm` inputs must be validated before service logic.

## Review Flow

Use TDD per checkpoint. Before every pause run `npx tsc --noEmit`, `npx vitest run`, and `openspec validate --all --strict --no-interactive`. Reports to the human must be in Spanish.
