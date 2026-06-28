## Why

The frontend V3 is already wired for roadmap features that the backend does not expose yet. The UI degrades gracefully on `404`/`501`, but the backend now needs an approved OpenSpec plan before implementation so recurring movements, category metadata/editing, budgets, and Google Drive OAuth can be added without contract drift.

Source contract: `docs/pendientes/frontend-pendientes-v3.md`.

## What Changes

- Add monthly recurring movement rules at `/api/recurring-rules`.
- Add pending recurring confirmation and transaction materialization.
- Extend categories with optional `icon` and `color`.
- Add category update/delete endpoints with a safe conflict policy.
- Add monthly budgets at `/api/budgets`.
- Resolve Google Drive connection from client-obtained refresh token toward backend-managed OAuth authorization-code flow.
- Preserve owner-context authorization through `Authorization` and `X-Owner-Id` for owner-scoped resources.

## Capabilities

### New Capabilities

- `frontend-ui-v3-contract`: Contract required by the already wired V3 frontend.
- `recurring-rules`: Monthly recurring movement rules and confirmation flow.
- `budgets`: Monthly category budget limits.

### Modified Capabilities

- `wallets-categories`: Add category metadata and update/delete behavior.
- `attachments-google-drive`: Add backend-managed OAuth consent/code exchange contract.
- `transactions-ledger`: Recurring confirmation must create transactions through the existing ledger path.

## Impact

- Affected API routes: `/api/recurring-rules`, `/api/categories/:id`, `/api/budgets`, `/api/drive/*`.
- Affected database models: `RecurringRule`, `Budget`, `Category`, and potentially `User` Drive fields.
- Affected systems: Prisma/MySQL, Google OAuth/Drive, transaction ledger service, tests, Bruno docs.
- Implementation must pause after each checkpoint for Spanish review.

## Out Of Scope

- Weekly/yearly recurring frequencies.
- Full scheduling worker beyond MVP lazy processing.
- Budget rollover, multi-currency budgets, or forecast analytics.
- Frontend UI changes unless the backend contract must be corrected.
