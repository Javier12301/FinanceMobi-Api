# Open Questions For Next Review

These questions must be resolved with the user before the implementer makes irreversible product decisions.

## Authentication

- Should there be a dedicated `POST /api/auth/register` endpoint, or is registration only implicit through Google SSO and a future UI flow?
- Are email verification, password reset, and account deletion required for the MVP?
- Should JWT access tokens be the only token type, or should refresh tokens be introduced later?

## Delegation

- The documentation describes accepting or rejecting delegation invitations. Should the MVP model pending invitations explicitly?
- Which endpoints are read-only for `ASESOR`, and which write endpoints are allowed for `SUPERVISOR`?
- How does the frontend send the active owner context: header, query parameter, body field, or session preference?
- Can a delegated user upload or delete attachments for the owner, or only view them?

## Wallets And Transactions

- Can wallet balances become negative?
- What should happen when deleting a wallet that already has transactions?
- Should transaction deletion be hard delete, soft delete, or reversal transaction plus audit snapshot?
- For transaction edits, should the original row be updated with history snapshots, or should immutable reversal/new rows be used?
- Are multiple currencies in scope, or is the MVP single-currency?
- For transfers, is a category required or should transfer use a system category/movement type?

## Categories And Lookups

- Should category CRUD be part of MVP even though endpoints are not listed?
- Are wallet types and movement types fixed seed data or user-manageable catalogs?
- Should default categories be created for each new user?

## Google Drive And Attachments

- What are the maximum file size, allowed MIME types, and max attachments per transaction?
- On Drive disconnect, should the backend delete only stored tokens, keep existing attachment references, or also delete Drive files?
- How should OAuth refresh-token loss or re-consent be handled?
- Should attachment links be proxied through the backend or returned as Drive links?

## Deployment

- Is production TLS/Certbot part of the first implementation or a later deployment task?
- Should MySQL/Redis/backend host ports be exposed in local development only through Compose profiles?
- What backup and restore strategy is required for MySQL and Redis volumes?
