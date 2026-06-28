# Tasks

## Testing Rule

- Use TDD for each checkpoint: write or update failing tests first.
- Do not mark a task complete until relevant tests pass.
- Before every checkpoint pause, run `npx tsc --noEmit`, `npx vitest run`, and `openspec validate --all --strict --no-interactive`.
- Human-facing checkpoint reports must be in Spanish.

## Checkpoint 1: Category Metadata And Management

- [x] 1. Add Prisma migration and tests for optional `Category.icon` and `Category.color`.
- [x] 2. Update category create/list responses to accept and return `icon`/`color`.
- [x] 3. Implement `PUT /api/categories/:id` with `{ name?, icon?, color? }`, preserving `movementType`.
- [x] 4. Implement `DELETE /api/categories/:id`, returning `409` when transactions reference the category.

Pause after this checkpoint and report in Spanish.

## Checkpoint 2: Budgets

- [x] 5. Add `Budget` model, migration, validation schemas, and owner/category authorization tests.
- [x] 6. Implement `GET /api/budgets` and `POST /api/budgets`.
- [x] 7. Implement `PUT /api/budgets/:id` and `DELETE /api/budgets/:id`.

Pause after this checkpoint and report in Spanish.

## Checkpoint 3: Recurring Rules

- [x] 8. Add `RecurringRule` model, migration, validation schemas, and owner-context tests.
- [x] 9. Implement `GET`, `POST`, `PUT`, and `DELETE /api/recurring-rules`.
- [x] 10. Implement `GET /api/recurring-rules/pending` for due non-auto rules.
- [x] 11. Implement `POST /api/recurring-rules/:id/confirm` through the transaction ledger path and advance `nextRunDate`.

Pause after this checkpoint and report in Spanish.

## Checkpoint 4: Drive OAuth Contract

- [x] 12. Add tests for Drive auth URL generation, state validation, code exchange, encrypted token storage, and root folder persistence.
- [x] 13. Implement `GET /api/drive/auth-url`.
- [x] 14. Update `POST /api/drive/connect` to accept authorization code flow while preserving safe handling of existing refresh-token tests if still needed.

Pause after this checkpoint and report in Spanish.

## Checkpoint 5: Contract QA And Documentation

- [x] 15. Update Bruno/API docs for all V3 endpoints.
- [x] 16. Run full verification and document any intentional deviations from `docs/pendientes/frontend-pendientes-v3.md`.
- [x] 17. Prepare final Spanish review summary for the orchestrator.
