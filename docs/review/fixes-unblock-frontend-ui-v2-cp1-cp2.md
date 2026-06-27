# Fixes Unblock Frontend UI V2 — CP1 + CP2

Status: do not approve CP1/CP2 yet. Automated checks pass, but these fixes are required before Checkpoint 3.

## Verification Run

```bash
npx tsc --noEmit
npx vitest run        # 84/84 passing
openspec validate --all --strict --no-interactive
```

## 1. Default Categories Do Not Match Approved Contract

Where:

- `src/features/auth/auth.service.ts`
- `DEFAULT_CATEGORIES`
- `src/features/auth/auth.test.ts`

Problem:

- Approved categories were:
  - `EXPENSE`: `Comida`, `Transporte`, `Servicios`, `Ocio`
  - `INCOME`: `Sueldo`
  - `TRANSFER`: `Transferencia`
- Current implementation creates:
  - `INCOME`: `Salario`, `Otros ingresos`, `Inversiones`
  - `EXPENSE`: `Alimentación`, `Transporte`, `Entretenimiento`
  - `TRANSFER`: `Transferencia`

Apply:

- Replace `DEFAULT_CATEGORIES` with exactly the approved list.
- Update tests to assert names and movement types, not only count `7`.

Why:

- Frontend onboarding and product copy depend on the approved default categories.

## 2. `GET /api/me` Drive Status Is Too Loose

Where:

- `src/features/auth/auth.service.ts`
- `getProfile()`
- `src/features/auth/auth.test.ts`

Problem:

- `driveConnected` currently checks only `encryptedGoogleRefreshToken`.
- V2 design says `driveConnected` is true when both `encryptedGoogleRefreshToken` and `driveFolderId` exist.

Apply:

- Change to `!!user.encryptedGoogleRefreshToken && !!user.driveFolderId`.
- Add tests for:
  - token only -> `false`
  - folder only -> `false`
  - token + folder -> `true`

Why:

- A token without the stored folder ID is not enough for uploads to work.

## 3. Register Response Status Must Match Frontend Contract

Where:

- `src/features/auth/auth.controller.ts`
- `registerController()`
- route/integration tests if present

Problem:

- Frontend pending contract says `POST /api/auth/register` expects response 200 with `{ token }`.
- Current controller returns `201`.

Apply:

- Return `res.json(result)` or `res.status(200).json(result)`.
- Add/update a route-level test for `POST /api/auth/register` status 200.

Why:

- Avoids breaking UI assumptions and keeps register response identical to login.

## 4. Race/Duplicate Handling For Register Email

Where:

- `src/features/auth/auth.service.ts`
- `registerWithCredentials()`

Problem:

- Duplicate check happens before transaction. Two concurrent requests with same email can both pass the check; one will hit DB unique constraint and likely return 500.

Apply:

- Keep the pre-check for fast `409`, but also catch Prisma unique constraint `P2002` from user create and convert to `AppError(409, 'Email ya registrado')`.
- Add test for unique constraint path if Prisma error mocking is already easy.

Why:

- Duplicate email should consistently return 409, not occasional 500.

## 5. Recreating A Revoked Delegation Breaks On Unique Constraint

Where:

- `src/features/delegations/delegation.service.ts`
- `createDelegation()`
- `src/features/delegations/delegation.test.ts`

Problem:

- Schema has `@@unique([ownerId, delegatedUserId])`.
- Current code only rejects `existing.active` and otherwise calls `create()`.
- If a delegation exists with `active=false`, `create()` violates the unique constraint.

Apply:

- If existing inactive delegation exists, update it to `{ active: true, role }` instead of creating a new row.
- Return 201 from the endpoint as before.
- Add test: inactive delegation is reactivated and role can be updated.

Why:

- Soft-delete requires reactivation support because the unique row remains in DB.

## 6. Delegation Routes Need Contract Decision Reflected

Where:

- `openspec/changes/unblock-frontend-ui-v2/design.md`
- `src/features/delegations/delegation.routes.ts`

Problem:

- The V2 design says delegation routes use `requireOwnerContext`.
- Implementation intentionally uses only authenticated user (`req.user.sub`) and ignores `X-Owner-Id`.

Apply one option:

- Option A: Keep implementation. Update `design.md` to say delegation management operates on authenticated user only and does not require `X-Owner-Id`.
- Option B: Change routes to require `X-Owner-Id` and require it to equal `req.user.sub` for delegation management.

Recommended now: Option A. It is simpler and safer: delegated users cannot grant/revoke delegations on behalf of another owner because service uses `req.user.sub`.

Why:

- Implementation and OpenSpec must agree before approving the checkpoint.

## Minor Cleanup

Where:

- `src/features/auth/auth.routes.ts`

Issue:

- `meController` is imported but not used in that file.

Apply:

- Remove unused import.

## Required Verification After Fixes

```bash
npx tsc --noEmit
npx vitest run
openspec validate --all --strict --no-interactive
```

Report in Spanish and wait for review before Checkpoint 3.
