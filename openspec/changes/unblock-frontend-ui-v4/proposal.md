> **ARCHIVADO 2026-06-28** — Implementación V4 completa. 182/182 tests, tsc limpio, QA manual aprobado.  
> Contrato publicado en `docs/para-front/contrato-frontend-v4.md`.  
> Fuente movida a `docs/finalizado/frontend-pendientes-v4.md`.

## Why

Frontend V4 is already planned around retention features that the backend does not expose yet. The UI can degrade gracefully while endpoints are missing, but implementation now needs an approved OpenSpec plan to avoid contract drift and to preserve the V3 guarantees around owner context, ACID ledger mutations, and Spanish checkpoint reporting.

Source contract: `docs/pendientes/frontend-pendientes-v4.md`.

## What Changes

- Seed a usable first-run owner workspace during registration: default `Efectivo` wallet and default categories with `icon`/`color`.
- Add owner activity stats at `GET /api/me/stats`.
- Add debts/loans management at `/api/debts`, including payment materialization through the existing transaction ledger.
- Add notification device registration and notification preferences under `/api/me/*`.
- Add monthly insights at `GET /api/insights`.
- Add server-side transaction filtering/search/pagination while preserving existing list compatibility.

## Capabilities

### New Capabilities

- `frontend-ui-v4-contract`: Contract required by the V4 frontend retention roadmap.
- `debts`: Owner-scoped debts and loans with payments.
- `notifications`: Device tokens and notification preferences.
- `insights`: Monthly summaries, comparisons, top categories, and largest expense.

### Modified Capabilities

- `auth-sessions`: Registration seeds onboarding data.
- `transactions-ledger`: Listing gains server-side filters/pagination and debt payments reuse ledger mutation.
- `recurring-rules`: Debts with installments may link to recurring rules rather than introducing a parallel scheduler.

## Impact

- Affected API routes: `/api/auth/register`, `/api/me/stats`, `/api/me/devices`, `/api/me/notification-prefs`, `/api/debts`, `/api/insights`, `/api/transactions`.
- Affected database models: `User`, `Wallet`, `Category`, `Transaction`, plus new `Debt`, `NotificationDevice`, and `NotificationPreference` models.
- Affected systems: Prisma/MySQL, Redis/session auth, transaction ledger service, recurrent rules, tests, Bruno docs.
- Implementation must pause after each checkpoint for Spanish review.

## Out Of Scope

- Actual push provider delivery integration beyond storing tokens/preferences and testable notification candidates.
- OCR receipt parsing.
- Templates synced across devices.
- Multi-currency.
- Frontend implementation changes.
