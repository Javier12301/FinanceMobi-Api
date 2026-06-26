## Why

FinanceVier needs a backend MVP that turns the approved planning documentation into a secure, reviewable implementation path. The repository currently contains planning artifacts only, so the implementer needs an explicit OpenSpec contract before writing code.

## What Changes

- Build a TypeScript Express backend with Prisma, MySQL, Redis, Docker Compose, and Nginx support.
- Implement authentication with credential login, Google SSO, JWT `jti`, and Redis-backed revocable sessions.
- Implement delegated authorization with owner context, `SUPERVISOR` read/write access, `ASESOR` read-only access, and ownership guards.
- Implement wallet, category, transaction, audit, and attachment foundations according to the base specs.
- Implement Google Drive receipt storage using user-owned storage and encrypted refresh tokens.
- Add security controls: Zod validation, Redis-backed rate limits, centralized errors, request logging, and IDOR protections.
- Require implementation pauses after every checkpoint of 2 or 3 tasks for human/OpenSpec review.

## Capabilities

### New Capabilities

- `backend-mvp`: Implementation sequencing and review workflow for the FinanceVier backend MVP.

### Modified Capabilities

- `backend-platform`: Implement the platform requirements already documented in the base spec.
- `auth-sessions`: Implement authentication and Redis session requirements already documented in the base spec.
- `delegation-authorization`: Implement delegated access requirements already documented in the base spec.
- `wallets-categories`: Implement wallet and catalog requirements already documented in the base spec.
- `transactions-ledger`: Implement transaction consistency and audit requirements already documented in the base spec.
- `attachments-google-drive`: Implement attachment and Google Drive requirements already documented in the base spec.

## Impact

- Affected code: new backend project files, `src/core/*`, `src/features/*`, `prisma/*`, Docker/Nginx configuration, tests, and environment templates.
- Affected systems: MySQL, Redis, Google OAuth, Google Drive API, Docker Compose, reverse proxy routing.
- Dependencies expected: Express, TypeScript, Prisma, MySQL driver, Redis client, bcrypt, JWT library, Zod, pino/pino-http, express-rate-limit, rate-limit-redis, Google auth/Drive client, test tooling.
- Human-facing implementer communication must remain in Spanish.
