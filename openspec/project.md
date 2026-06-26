# FinanceVier Backend OpenSpec Context

FinanceVier is a personal finance management backend. The implementation target is a TypeScript, Node.js, Express, Prisma, MySQL, Redis, Docker Compose, and Nginx backend.

## Mandatory Communication Rule

Any comment, status update, explanation, review note, blocker report, or question that an implementation agent writes for the human user MUST be written in Spanish.

Internal OpenSpec artifacts, code, identifiers, database names, tests, commits, and agent-to-agent documentation MAY be written in English.

## Source Documentation

- Primary source: `docs/Finance-DOCU/Plan - FinanceVier 38b7a95b97b280869621c4d7573a66f3.md`
- This OpenSpec layer extracts backend requirements only.
- Frontend and mobile notes are context, not implementation scope for this backend repository unless a backend contract is required.

## Backend Architecture Rules

- Use TypeScript for all backend source code.
- Use Express as the HTTP framework.
- Use Prisma as the ORM.
- Use MySQL as the relational database.
- Use Redis for sessions and shared rate-limit counters.
- Structure business code by vertical feature slices under `src/features/*`.
- Keep shared infrastructure under `src/core/*`.
- Validate request input with Zod before controller logic.
- Use centralized error handling and structured request logging.

## Security Rules

- Passwords MUST be hashed with bcrypt and never stored in plain text.
- JWTs MUST contain a unique `jti` per issued token.
- Redis session keys MUST use `session:{userId}:{jti}`.
- Logout MUST revoke only the current session unless a separate explicit all-session logout is implemented.
- Redis session TTL MUST match JWT expiration.
- Google Drive refresh tokens MUST be encrypted at rest with AES-256-GCM before persistence.
- Google Drive integration MUST request the least-privileged practical scope, planned as `drive.file`.
- Authorization MUST combine authentication, delegated role checks, and ownership/resource guards.
- Any endpoint accepting resource IDs MUST protect against IDOR.

## Financial Consistency Rules

- Wallet balances are intentionally denormalized in `Wallet.currentBalance`.
- Balance mutations MUST run inside ACID database transactions.
- Affected wallet rows MUST be locked before balance mutation.
- Transaction edits/deletes MUST preserve auditability through `TransactionHistory` snapshots.
- Monetary amounts MUST be represented with fixed precision decimal database types, not floating point storage.

## Review Workflow Rule

Implementation work MUST pause after each checkpoint of 2 or 3 tasks. The implementer must report progress in Spanish and wait for the OpenSpec reviewer/user to validate correctness, security, and alignment before continuing.
