# Fixes To Apply Before Checkpoint 4

Read this file only. Apply these fixes before starting Checkpoint 4.

## 1. Credential Login Dummy Hash

Where:

- `src/features/auth/auth.service.ts`
- `src/features/auth/auth.test.ts`

Problem:

- `loginWithCredentials()` uses a fake bcrypt-looking string when the user does not exist.
- If the dummy hash is not a valid bcrypt hash, `bcryptjs.compare()` can return faster and weaken the intended user-enumeration protection.

Apply:

- Replace the fake string with a real precomputed bcrypt hash generated once for a dummy password.
- Keep the behavior: when the user does not exist, still call `verifyPassword(password, DUMMY_PASSWORD_HASH)`.
- Add or update a test proving that missing-user login still calls `verifyPassword()` with a valid bcrypt hash-looking value.

Why:

- Login must keep the same observable behavior for unknown email and wrong password.

## 2. Google Email Verification

Where:

- `src/core/security/googleAuth.ts`
- `src/features/auth/auth.service.ts`
- `src/features/auth/google.auth.test.ts`

Problem:

- Google SSO currently accepts `sub` and `email`, then links/logs in by `googleId OR email`.
- It does not require `email_verified === true` before trusting the email.

Apply:

- Read `email_verified` from the Google ID token payload.
- Reject the token with `AppError(401, 'Token de Google inválido')` if email is missing or not verified.
- Keep client-facing error generic.
- Add a test for unverified Google email being rejected.

Why:

- Email-based account matching is only safe if Google confirms the email is verified.

## 3. Encryption Key Hex Validation

Where:

- `src/core/config/env.ts`

Problem:

- `ENCRYPTION_KEY` validates length 64 but not that all chars are hex.

Apply:

- Change validation to require exactly 64 hex chars: `/^[0-9a-fA-F]{64}$/`.

Why:

- AES-256-GCM needs 32 bytes. A non-hex 64-char string should fail at startup, not during token encryption.

## 4. MovementType Schema Decision

Where:

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `openspec/specs/wallets-categories/spec.md` if the contract changes

Problem:

- Current Prisma schema uses `enum MovementType`.
- Original docs mentioned `MovementType` as lookup seed data.

Apply:

- Do not change this until the user confirms one option.
- Recommended for MVP: keep enum if values are fixed: `INCOME`, `EXPENSE`, `TRANSFER`.
- If the user wants editable/DB-managed movement types, switch to lookup table before creating real migrations.

Why:

- This affects DB migrations and should be decided before ledger work.

## Required Verification

Run:

```bash
npx tsc --noEmit
npx vitest run
npm audit
```

Report in Spanish and wait for approval before Checkpoint 4.
