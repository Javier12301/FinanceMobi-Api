# Fixes CP6-CP7 Review

Status: do not approve CP6/CP7 yet. Automated checks pass, but these fixes are required before continuing.

## Verification Run

```bash
npx tsc --noEmit
npx vitest run        # 65/65 passing
openspec validate --all --strict --no-interactive
```

## 1. Transaction List IDOR

Where:

- `src/features/transactions/transactions.service.ts`
- `listTransactions()`

Problem:

- The service first gets wallet IDs owned by `ownerId`, but when `filters.walletId` exists it overwrites `where.walletId` with the raw requested wallet ID.
- A user can request another owner's `walletId` and list transactions for that wallet if they know/guess the ID.

Apply:

- Keep owner scope even when filtering by wallet.
- Minimal fix: if `filters.walletId` is present and not included in `walletIds`, return `[]` or throw a generic 404/403.
- Otherwise query with the requested wallet ID only after membership check.
- Add a test: filtering with another owner's wallet ID must not return transactions.

Why:

- This is an IDOR risk and contradicts the CP6 report.

## 2. `FOR UPDATE` Outside Transaction In Update

Where:

- `src/features/transactions/transactions.service.ts`
- `updateTransaction()` line using `$queryRaw`

Problem:

- `updateTransaction()` uses `(prisma as any).$queryRaw` inside a `$transaction` callback.
- That uses the global Prisma client, not the transaction client `tx`, so the `FOR UPDATE` lock may run outside the transaction.

Apply:

- Change to `(tx as any).$queryRaw`.
- Add/adjust a test that distinguishes `tx.$queryRaw` from global `prisma.$queryRaw`.

Why:

- Row locks must be acquired on the same transaction connection to protect balance mutation.

## 3. Transfer Update Does Not Adjust Destination Wallet

Where:

- `src/features/transactions/transactions.service.ts`
- `updateTransaction()`

Problem:

- Updating a `TRANSFER` only reverts/applies the source wallet.
- The destination wallet balance is not reverted/applied.

Apply:

- For transfer updates, lock both source and destination wallets with `tx.$queryRaw`.
- Revert old source and old destination balances.
- Apply new amount to source and destination.
- If destination wallet is not editable in this checkpoint, explicitly reject transfer update until supported.
- Add tests for updating transfer amount and checking both wallet update calls.

Why:

- Current behavior can corrupt balances.

## 4. Category Ownership Missing On Update

Where:

- `src/features/transactions/transactions.service.ts`
- `updateTransaction()`

Problem:

- Create validates `category.ownerId`, but update accepts `input.categoryId` without checking ownership.

Apply:

- If `input.categoryId` is provided, load it inside the transaction and verify `category.ownerId === ownerContext.ownerId`.
- Add a test: updating to another owner's category is rejected.

Why:

- Prevents cross-owner category references.

## 5. Attachment Upload Policy Contradiction

Where:

- `src/features/attachments/attachments.service.ts`
- `uploadAttachment()`

Problem:

- The report says upload MIME/size policy is unresolved and returns `501` in MVP.
- Code actually allows PDFs/images/docs under 10MB and uploads them to Drive.

Apply one option:

- Option A, safer MVP: make `uploadAttachment()` return `501` before accepting any file upload until policy is approved.
- Option B, if policy is now approved: document the approved MIME list and 10MB limit in OpenSpec/README and keep the implementation.

Recommended now: Option A, because the OpenSpec test-plan says unresolved upload limits must block implementation.

Why:

- Current code implements a product/security policy that was not approved.

## 6. Attachment Upload Memory Limit

Where:

- `src/features/attachments/attachments.routes.ts`
- `multer.memoryStorage()`

Problem:

- Uploads are stored in memory and no multer `limits.fileSize` is configured.
- Even if service later rejects a large file, multer may already have buffered it.

Apply:

- If Option A above is chosen, remove/disable upload endpoint body processing until policy exists.
- If Option B is chosen, set `limits: { fileSize: 10 * 1024 * 1024 }` in multer.

Why:

- Avoids avoidable memory pressure from large uploads.

## Required Verification After Fixes

```bash
npx tsc --noEmit
npx vitest run
openspec validate --all --strict --no-interactive
```

Report in Spanish and wait for review before Checkpoint 8.
