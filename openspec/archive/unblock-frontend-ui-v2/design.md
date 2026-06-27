## Overview

This change implements the backend contracts that the current frontend already expects. The implementation must stay minimal, preserve the existing security chain, and avoid introducing unresolved product workflows.

## Decisions

| Topic | Decision |
|-------|----------|
| Registration response | `POST /api/auth/register` returns `{ token }` and starts a Redis-backed session immediately. |
| Delegation invitation | Access is immediate after creation. No pending/acceptance state in this version. |
| Delegation revocation | Soft-delete via `active = false`. Do not hard-delete delegation rows. |
| Profile endpoint | `GET /api/me` returns `id`, `name`, `email`, and `driveConnected`. |
| Default categories | New credential users receive default categories during registration. |
| Upload storage | Use multer `memoryStorage()` with strict limits; do not write files to container disk. |
| Attachment upload count | Max 3 files per transaction. |
| Attachment file size | Max 5 MB per file. |
| Attachment request size | Max 15 MB total file payload. |
| Attachment MIME allowlist | `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. |
| Transaction delete | Delete Drive attachments first; if successful, reverse balances and delete DB records in a Prisma transaction. |

## API Design

### `POST /api/auth/register`

Request:

```json
{ "name": "Javier Lopez", "email": "javier@email.com", "password": "min-8-chars" }
```

Behavior:

- Validate `name`, `email`, `password >= 8`.
- Reject duplicate email with `409`.
- Hash password with the existing password helper.
- Create user and default categories in one DB transaction.
- Issue a normal system JWT session using the existing session helper.
- Return `200` with `{ "token": "..." }` to match the current frontend.
- Reuse the auth rate limiter.

Default categories:

- `EXPENSE`: `Comida`, `Transporte`, `Servicios`, `Ocio`
- `INCOME`: `Sueldo`
- `TRANSFER`: `Transferencia`

### `GET /api/me`

Behavior:

- Protected by `authMiddleware`.
- Does not require `X-Owner-Id` because it describes the authenticated session user.
- Returns:

```json
{
  "id": "uuid",
  "name": "Javier Lopez",
  "email": "javier@email.com",
  "driveConnected": true
}
```

`driveConnected` is `true` when the user has both `encryptedGoogleRefreshToken` and `driveFolderId`.

### Delegations

Routes:

- `GET /api/delegations`
- `POST /api/delegations`
- `DELETE /api/delegations/:id`

All routes require `authMiddleware`. Delegation management operates on the authenticated user directly (`req.user.sub`) and does not require `X-Owner-Id`. A delegated user cannot manage delegations on behalf of an owner.

`GET /api/delegations` returns:

```json
{
  "granted": [
    { "id": "uuid", "role": "SUPERVISOR", "user": { "id": "uuid", "name": "Maria", "email": "maria@email.com" } }
  ],
  "managing": [
    { "id": "uuid", "role": "ASESOR", "user": { "id": "uuid", "name": "Ana", "email": "ana@email.com" } }
  ]
}
```

Rules:

- `granted`: delegations where authenticated user is the owner; `user` is the delegated user.
- `managing`: delegations where authenticated user is the delegated user; `user` is the owner.
- Only active delegations are returned.
- `POST /api/delegations` creates immediate active access for an existing user by email.
- `POST` rejects self-delegation.
- `POST` rejects duplicate active delegations with `409`.
- `DELETE` can only revoke a delegation where `ownerId === req.user.sub`.
- `DELETE` sets `active = false` and returns `204`.

### Attachment Upload

Route:

`POST /api/transactions/:transactionId/attachments`

Middleware:

- `authMiddleware`
- `requireOwnerContext`
- `requireRole('OWNER', 'SUPERVISOR')`
- multer configured with:
  - `storage: multer.memoryStorage()`
  - `limits.fileSize = 5 * 1024 * 1024`
  - `limits.files = 3`
  - `fileFilter` allowlist for approved MIME types

Request:

- `multipart/form-data`
- field name: `file`
- max 3 files using `upload.array('file', 3)`

Behavior:

- Validate the transaction belongs to the active owner context.
- Validate the owner has Drive connected.
- Reject unsupported MIME types with `400`.
- Reject too many files with `400`.
- Reject file size limit with `400` or `413`; prefer `400` if easier to keep current error contract simple.
- Upload each file to the owner's Drive folder.
- Include Drive app properties: `transactionId`, `ownerId`, `mimeType`.
- Create one `TransactionAttachment` DB row per successful Drive upload.
- If Drive upload fails before DB insert, do not create DB rows.
- If one file fails after previous files uploaded, delete the already uploaded files best-effort and do not persist partial DB rows.

### Attachment Delete

Route:

`DELETE /api/transactions/:transactionId/attachments/:attachmentId`

Behavior:

- Protected by owner context and `OWNER`/`SUPERVISOR` role.
- Verify attachment belongs to the transaction and the transaction belongs to the active owner context.
- Delete the Google Drive file first.
- If Drive delete fails, return an error and keep DB unchanged.
- If Drive delete succeeds, delete the attachment DB row.
- Return `204`.

### Transaction Delete

Route:

`DELETE /api/transactions/:id`

Behavior:

- Protected by owner context and `OWNER`/`SUPERVISOR` role.
- Load the transaction, affected wallets, and attachments.
- Verify transaction ownership through source wallet owner.
- Delete all Drive files for the transaction attachments before DB mutation.
- If any Drive delete fails, abort and leave DB unchanged.
- Inside a Prisma transaction:
  - Lock affected wallet rows with `FOR UPDATE` through the transaction client `tx`.
  - Reverse the transaction's balance effect.
  - Create `TransactionHistory` with `action = 'DELETE'`, `oldSnapshot = transaction`, `newSnapshot = null`.
  - Delete `TransactionAttachment` DB rows.
  - Delete the `Transaction` row.
- Return `204`.

## Cross-System Consistency Note

Google Drive and MySQL cannot participate in one distributed transaction. The chosen MVP behavior is conservative: delete Drive files before DB mutation. If Drive deletion fails, DB remains unchanged. If DB mutation fails after Drive deletion, the system may retain DB references to deleted Drive files; log this case for manual repair.

## Testing Strategy

- Use TDD before implementation per checkpoint.
- Mock Prisma, Redis, Google Drive, and multer error paths where useful.
- Keep route-level tests for middleware behavior and service-level tests for balance/Drive logic.
- Run before every checkpoint pause:

```bash
npx tsc --noEmit
npx vitest run
openspec validate --all --strict --no-interactive
```
