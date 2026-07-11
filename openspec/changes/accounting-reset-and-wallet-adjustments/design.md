## Context

Wallet balances are denormalized and the native client persists queued accounting mutations in SQLite. Existing transaction deletion is soft-delete/audited, while an accounting reset must remove its dependent database rows and Drive attachments without touching account-level data.

## Goals / Non-Goals

**Goals:**
- Provide a self-owner-only, online reset that atomically removes local accounting records after remote attachment cleanup.
- Represent reconciliation as a distinct ledger entry that changes a locked wallet balance but does not become income or expense.
- Prevent the current device's stale cached or queued data from returning after reset.

**Non-Goals:**
- Offline reset or offline target-balance adjustment.
- Changing delegation permissions, check-in/streak logic, category configuration, or global multi-device conflict resolution.

## Decisions

- Reset is a dedicated endpoint rather than composed deletes. It can validate the actor and perform FK-safe deletion in one database transaction.
- Retained wallets are reset to zero. A subsequent explicit setup flow writes a new opening balance; this avoids retaining an unexplained historical balance.
- Drive files are deleted first. The file API is not transactional; failure leaves database data intact and retry treats already-missing files as deleted.
- `ADJUSTMENT` is a ledger movement, with signed delta and resulting balance, rather than an edit to `initialBalance`. This preserves an auditable timeline and keeps analytics behavior explicit.
- The client blocks reset until its owner-scoped outbox is empty, then purges that owner queue and financial queries only after confirmed success. This is the v4-safe alternative to adding an epoch to every mutation.

## Risks / Trade-offs

- [Drive cleanup can partially succeed] -> database data remains intact; retries are idempotent for missing files.
- [Another device can submit old queued data] -> reset remains online-only and client outbox is scoped; full cross-device epochs are deferred because v4 does not implement conflict-versioned sync.
- [Hard delete loses historical transaction audit] -> this is the declared purpose of the destructive, double-confirmed reset.

## Migration Plan

Add the new movement enum/fields with a Prisma migration, deploy backend and frontend together, and verify the endpoint before exposing the Settings action. Rollback hides the UI; existing INCOME, EXPENSE and TRANSFER records remain compatible.

## Open Questions

None for this v4 implementation.
