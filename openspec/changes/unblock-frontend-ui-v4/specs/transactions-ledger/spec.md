## MODIFIED Requirements

### Requirement: Transaction filters

The backend SHALL support transaction listing filters for text search, wallet, date range, category, movement type, and pagination.

#### Scenario: Filter by wallet

- WHEN a user lists transactions with `walletId`
- THEN the backend SHALL return only authorized transactions associated with that wallet.

#### Scenario: Combined server-side filters

- WHEN a user lists transactions with any combination of `q`, `from`, `to`, `categoryId`, `walletId`, and `type`
- THEN the backend SHALL return `{ items, total, page, pageSize }`
- AND `items` SHALL contain only authorized transactions matching all submitted filters.

#### Scenario: Paginated list

- WHEN a user lists transactions with `page` and `pageSize`
- THEN the backend SHALL return `{ items, total, page, pageSize }`.

#### Scenario: Compatibility list

- WHEN a user lists transactions without query parameters
- THEN the backend SHALL preserve the existing V3 frontend-compatible array response.

#### Scenario: Filtered list defaults pagination

- WHEN a user lists transactions with filter or search query parameters but without `page` or `pageSize`
- THEN the backend SHALL return `{ items, total, page, pageSize }`
- AND it SHALL apply default pagination values.

### Requirement: Debt payments use ledger balance mutation

Debt payment operations SHALL reuse the transaction ledger balance mutation path rather than mutating wallet balances independently.

#### Scenario: Debt payment creates transaction

- GIVEN a debt payment is accepted
- WHEN the backend materializes the payment
- THEN it SHALL create the corresponding transaction through the same ACID ledger path used by manual transaction creation.

#### Scenario: Debt payment uses unauthorized wallet

- GIVEN a debt belongs to the active owner context
- WHEN the payment body references a wallet outside that owner context
- THEN the backend SHALL reject the request without mutating wallet balance, transaction rows, or debt state.
