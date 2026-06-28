# Tasks

## Testing Rule

- Use TDD for each checkpoint: write or update failing tests first.
- Do not mark a task complete until relevant tests pass.
- Before every checkpoint pause, run `npx tsc --noEmit`, `npx vitest run`, and `openspec validate --all --strict --no-interactive`.
- Human-facing checkpoint reports must be in Spanish.

## Checkpoint 1: Onboarding Seed And Activity Stats

- [x] 1. Add tests for registration seeding one `Efectivo` wallet and the default V4 category catalog with `icon`/`color`.
- [x] 2. Implement idempotent onboarding seed creation during `POST /api/auth/register`.
- [x] 3. Add tests for `GET /api/me/stats` streak, active days this month, total movements, and empty-state response.
- [x] 4. Implement `GET /api/me/stats` from owner/user transactions without accepting `X-Owner-Id`.

Pause after this checkpoint and report in Spanish.

## Checkpoint 2: Debts And Loans

- [x] 5. Add Prisma model/migration and tests for `Debt` ownership, direction, decimal fields, status, and optional category/recurring links.
- [x] 6. Implement `GET /api/debts` and `POST /api/debts` with owner-context authorization and response decimal strings.
- [x] 7. Implement `PUT /api/debts/:id` and `DELETE /api/debts/:id` with IDOR-safe lookups.
- [x] 8. Implement `POST /api/debts/:id/pay` through the existing transaction ledger path, updating `remaining`, installments, `dueDate`, and `status` atomically.
- [x] 9. Add tests for debt payment failures rolling back both wallet balance and debt state.

Pause after this checkpoint and report in Spanish.

## Checkpoint 3: Notification Devices And Preferences

- [x] 10. Add Prisma models/migration and tests for `NotificationDevice` and `NotificationPreference`.
- [x] 11. Implement `POST /api/me/devices` and `DELETE /api/me/devices/:token` for authenticated users without owner context.
- [x] 12. Implement `GET /api/me/notification-prefs` and `PUT /api/me/notification-prefs` with default preference creation.
- [x] 13. Add service-level tests for notification candidates: daily reminder, due manual recurring rules, budget thresholds, and streak risk.

Pause after this checkpoint and report in Spanish.

## Checkpoint 4: Insights And Transaction Querying

- [x] 14. Add tests for `GET /api/insights?month=YYYY-MM`, including previous-month comparison, top categories, and biggest expense.
- [x] 15. Implement `GET /api/insights` with owner-context authorization and decimal-string responses.
- [x] 16. Add tests for transaction filters: `q`, `from`, `to`, `categoryId`, `walletId`, `type`, `page`, and `pageSize`.
- [x] 17. Implement server-side filters/search/pagination for `GET /api/transactions`, preserving existing behavior when no query params are provided.

Pause after this checkpoint and report in Spanish.

## Checkpoint 5: Contract QA And Documentation

- [x] 18. Update Bruno/API docs for all V4 endpoints.
- [x] 19. Document intentional deferrals for templates, OCR, push-provider delivery, and multi-currency.
- [x] 20. Run full verification and prepare final Spanish review summary for the orchestrator.

Pause after this checkpoint and report in Spanish.
