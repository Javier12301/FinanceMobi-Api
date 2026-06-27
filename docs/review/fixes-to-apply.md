# Complexity Cuts Before Checkpoint 6

Scope: over-engineering only. Do not change behavior. Keep tests green.

## 1. Single Source For Zod Schemas

Where:

- `src/features/wallets/wallets.service.ts`
- `src/features/wallets/wallets.routes.ts`
- `src/features/wallets/categories.service.ts`
- `src/features/wallets/categories.routes.ts`

Cut:

- Zod schemas are duplicated in routes and services.
- Request validation already runs in `validate(schema)` before controllers.

Apply:

- Move schemas to one shared module, for example `src/features/wallets/wallets.schema.ts`.
- Routes import schemas for `validate(schema)`.
- Services accept already validated typed input and stop calling `.parse()` again.

Why:

- One validation path is enough. Duplicate schemas drift and add noise.

## 2. Remove Duplicate Wallet Ownership Check From Service

Where:

- `src/features/wallets/wallets.service.ts`
- `src/features/wallets/wallets.controller.ts`

Cut:

- `deleteWallet(walletId, ownerId)` repeats ownership validation already enforced by `ownershipGuard('wallet', 'walletId')` in the route.

Apply:

- Change service signature to `deleteWallet(walletId: string)`.
- Keep only transaction-count check and delete.
- Controller no longer passes `ownerContext.ownerId` to delete service.

Why:

- Authorization belongs to the middleware chain for this endpoint. Rechecking it in the service is duplicate work.

## 3. Consolidate Express Request Type Augmentation

Where:

- `src/core/middlewares/auth.ts`
- `src/core/types/express.d.ts`

Cut:

- `Request` is augmented in two places.

Apply:

- Move `user?: JwtPayload` into `src/core/types/express.d.ts`.
- Remove `declare global` from `auth.ts`.

Why:

- One augmentation file is easier to find and avoids future merge/conflict noise.

## 4. Remove Superficial Role Tests From Wallet Service Tests

Where:

- `src/features/wallets/wallets.test.ts`

Cut:

- Tests that mention `ASESOR` behavior while calling wallet services directly.
- Services do not enforce roles; routes/middlewares do.

Apply:

- Delete those tests or convert them into route/middleware tests if coverage is needed.

Why:

- A test that cannot fail for the behavior it names is noise.

## Required Verification

Run:

```bash
npx tsc --noEmit
npx vitest run
```

Report in Spanish before starting Checkpoint 6.
