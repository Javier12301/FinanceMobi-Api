# Fixes CP6-CP7 Follow-up

Status: one blocker remains before manual QA approval for CP7 upload behavior.

## Verification Run

```bash
npx tsc --noEmit
npx vitest run        # 65/65 passing
openspec validate --all --strict --no-interactive
```

## 1. Attachment Upload Route Returns 500 Instead Of 501

Where:

- `src/features/attachments/attachments.routes.ts`
- `src/features/attachments/attachments.controller.ts`

Problem:

- Multer was removed, so `req.file` is always undefined.
- `uploadAttachmentHandler()` throws `new Error('No file provided')` before calling `uploadAttachment()`.
- Result: the route can return HTTP 500 instead of the intended `AppError(501)` for unresolved upload policy.

Apply:

- Minimal fix: make `uploadAttachmentHandler()` immediately throw `new AppError(501, 'Los límites de tipo y tamaño de archivo no están aprobados. La funcionalidad de subida no está disponible aún.')` until upload policy is approved.
- Remove unused call path to `uploadAttachment()` from the controller for now, or leave service-level 501 as defense-in-depth.
- Add a route/controller test proving `POST /api/transactions/:transactionId/attachments` returns 501 while policy is pending.

Why:

- Pending product policy should produce explicit 501, not an unexpected 500.

## Optional Hardening

Where:

- `src/features/transactions/transactions.service.ts`

Suggestion:

- In transfer update, after loading `destWallet`, also verify `destWallet.ownerId === ownerContext.ownerId`.

Why:

- Create currently prevents cross-owner transfer destinations, but checking on update keeps the invariant local and safer against inconsistent old data.

## Required Verification After Fix

```bash
npx tsc --noEmit
npx vitest run
openspec validate --all --strict --no-interactive
```
