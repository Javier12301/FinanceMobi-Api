# Test Plan

This plan is part of `implement-backend-mvp`. It defines the minimum tests required for each checkpoint.

## Rules

- Use TDD for new checkpoint work: write or update the failing test first, implement the smallest code that passes, then refactor only if needed.
- A task is complete only when its relevant automated tests pass.
- Use Vitest for backend unit/integration tests.
- Use `vi.fn` or module mocks for Redis, Prisma, Google clients, and Drive calls when a real service is not required.
- Prefer small tests around behavior and security boundaries over snapshot-heavy tests.
- Run `npx tsc --noEmit` and `npx vitest run` before each checkpoint pause.
- Add Bruno/manual API checks only when endpoints are usable from a running server.

## Checkpoint 1: Project Foundation

Status: completed before this test plan was added.

Minimum regression coverage to keep:

- `GET /api/health` returns HTTP 200 and `{ status: "ok" }`.
- Invalid environment configuration fails fast.
- Validation middleware rejects invalid body/params/query with HTTP 400.
- Error handler returns JSON without leaking stack traces in non-development mode.

Manual QA:

- Start server locally and call `GET /api/health` from Bruno or curl.

## Checkpoint 2: Authentication And Sessions

Status: completed before this test plan was added.

Minimum regression coverage to keep:

- Valid login returns a JWT and creates `session:{userId}:{jti}` in Redis.
- Unknown email and wrong password return the same generic error.
- Password verification path does not reveal user existence through behavior.
- Auth middleware rejects missing, invalid, expired, and Redis-revoked tokens.
- Logout deletes only the current session key and leaves other session keys valid.
- Auth rate limit uses Redis-backed counters.

Manual QA starts here for smoke only:

- Bruno collection may include `Health`, `Login`, `Authenticated Request`, and `Logout` requests.
- Do not make manual QA a gate for Google, delegation, wallet, transaction, or Drive behavior yet.

## Checkpoint 3: Google SSO And Token Security

Write tests before implementation:

- Valid mocked Google `id_token` identifies an existing user and issues a system JWT.
- Valid mocked Google `id_token` creates a new user when none exists.
- Invalid Google `id_token` is rejected.
- Google `id_token` is not stored.
- AES-256-GCM encryption returns ciphertext that differs from plaintext.
- Decryption restores the original refresh token with the configured key.
- Decryption fails with the wrong key or tampered payload.
- Plain refresh tokens are never sent to logger calls or persisted fields.

Manual QA:

- Keep manual QA optional unless real Google OAuth credentials are configured.
- If credentials exist, test only the happy path and one invalid-token case in Bruno.

## Checkpoint 4: Delegation Authorization

Write tests before implementation:

- Owner can access own resources.
- `SUPERVISOR` can read and write in the delegated owner context.
- `ASESOR` can read in the delegated owner context.
- `ASESOR` cannot create, update, or delete owner data.
- Revoked delegation loses access.
- Guessed wallet/transaction/attachment IDs from another owner are rejected.
- Missing or invalid active owner context is rejected.

Manual QA becomes required here:

- Bruno should include owner login, delegated user login, owner-context selection, allowed supervisor action, blocked advisor write, and blocked guessed-ID request.

## Checkpoint 5: Wallets, Categories, And Lookups

Write tests before implementation:

- Seed creates wallet types and movement types idempotently.
- Wallet create sets `initialBalance` and `currentBalance` to the submitted amount.
- Wallet list returns only resources for the active owner context.
- Wallet update changes metadata without changing balance.
- Wallet delete follows the resolved deletion policy.
- Category use is restricted to the same owner context as the wallet.

Manual QA:

- Bruno should cover wallet create/list/update and at least one authorization failure.

## Checkpoint 6: Transaction Ledger

Write tests before implementation:

- Amount `<= 0` is rejected.
- Income increases wallet balance.
- Expense decreases wallet balance according to negative-balance policy.
- Transfer creates one transaction and updates source/destination balances atomically.
- Failed transaction operation rolls back all balance changes.
- Concurrent writes cannot corrupt the final balance.
- Filters by wallet, category, and date range return only authorized transactions.
- Edit/delete behavior creates full `TransactionHistory` snapshots once policy is resolved.

Manual QA:

- Bruno should cover income, expense, transfer, filters, and one failed authorization case.
- User should start business QA here: compare balances manually before and after each operation.

## Checkpoint 7: Attachments And Google Drive

Write tests before implementation:

- Drive connect stores encrypted refresh token and root folder ID.
- Upload rejects unsupported MIME type or oversized file according to resolved policy.
- Upload calls mocked Drive API with `drive.file` scope assumptions and app metadata.
- Attachment list returns only authorized transaction attachments.
- Delete follows resolved database/Drive deletion policy.
- Drive API failure does not leave inconsistent DB records.

Manual QA:

- Use Bruno for metadata/list/delete endpoint checks.
- Use real Drive only if test OAuth credentials are available and the user approves external calls.

## Checkpoint 8: Deployment Hardening

Write tests/checks before finalization:

- `docker compose config` succeeds.
- MySQL, Redis, and backend health checks are defined.
- Backend health check targets `/api/health`.
- Nginx forwards `/api/*` without stripping `/api`.
- Nginx sets `Host`, `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto`.
- `.env.example` contains every required variable without secrets.

Manual QA:

- Run the stack locally.
- Use Bruno smoke requests through the proxy URL, not only direct backend URL.
