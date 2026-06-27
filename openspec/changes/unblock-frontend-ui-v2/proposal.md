## Why

The backend MVP is complete, but the current frontend already calls several endpoints that are either missing or intentionally stubbed. This change unlocks the UI v1 flows without adding roadmap features that are not needed yet.

## What Changes

- Add email/password registration with automatic login: `POST /api/auth/register` returns `{ token }`.
- Add authenticated profile endpoint: `GET /api/me`, including `driveConnected`.
- Create default categories for new users during registration.
- Implement the delegation management endpoints consumed by Settings:
  - `GET /api/delegations`
  - `POST /api/delegations`
  - `DELETE /api/delegations/:id`
- Use immediate delegation access for MVP; no pending/acceptance state.
- Revoke delegations with soft-delete by setting `active = false`.
- Enable attachment uploads to Google Drive with approved limits:
  - max 3 files per transaction
  - max 5 MB per file
  - max 15 MB total request payload
  - allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- Enable attachment deletion by deleting the Drive file and DB record.
- Enable transaction deletion by deleting Drive attachments first, then reversing balances and removing DB records inside a DB transaction.

## Capabilities

### New Capabilities

- `frontend-ui-v2-contract`: Backend endpoints required to unblock the current frontend UI v1/V2 integration.

### Modified Capabilities

- `auth-sessions`: Add registration, profile, and default-category onboarding behavior.
- `delegation-authorization`: Add delegation management endpoints and soft revocation behavior.
- `attachments-google-drive`: Resolve upload/delete policies and enable Drive-backed receipt management.
- `transactions-ledger`: Resolve transaction deletion policy with balance reversal and attachment cleanup.
- `wallets-categories`: Add default categories for newly registered users.

## Impact

- Affected API routes: `/api/auth/register`, `/api/me`, `/api/delegations`, `/api/transactions/:id`, `/api/transactions/:id/attachments`.
- Affected database tables: `User`, `Category`, `UserDelegation`, `Wallet`, `Transaction`, `TransactionHistory`, `TransactionAttachment`.
- Affected integrations: Redis sessions, Google Drive API, multer multipart upload middleware.
- Frontend impact: unlocks register, profile name/Drive status, delegation settings, transaction delete, receipt upload/delete.

## Out Of Scope

- Delegation invitation acceptance workflow.
- Recurring transactions.
- Budgets.
- Category icon/color.
- Server-side `movementType` filter.
- Google Drive OAuth authorization-code flow redesign.
