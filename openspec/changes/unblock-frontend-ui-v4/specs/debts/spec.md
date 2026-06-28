## ADDED Requirements

### Requirement: Debt management

The backend SHALL support owner-scoped debts and loans at `/api/debts`.

#### Scenario: Debt is created

- GIVEN a valid active owner context and body with `direction`, `counterparty`, `principal`, optional `categoryId`, optional `installmentsTotal`, optional `dueDate`, and optional `notes`
- WHEN an authorized owner or supervisor calls `POST /api/debts`
- THEN the backend SHALL create a debt with `remaining = principal`
- AND `status = ACTIVE`
- AND return HTTP 201 with decimal amounts serialized as strings.

#### Scenario: Debts are listed

- GIVEN debts exist for multiple owners
- WHEN the frontend calls `GET /api/debts`
- THEN the backend SHALL return only debts for the active owner context.

### Requirement: Debt mutation

The backend SHALL allow authorized updates and deletion for owner-scoped debts.

#### Scenario: Debt is updated

- GIVEN a debt belongs to the active owner context
- WHEN an authorized owner or supervisor calls `PUT /api/debts/:id`
- THEN the backend SHALL update submitted fields among `counterparty`, `remaining`, `status`, and `notes`.

#### Scenario: Debt is deleted

- GIVEN a debt belongs to the active owner context
- WHEN an authorized owner or supervisor calls `DELETE /api/debts/:id`
- THEN the backend SHALL delete it or safely deactivate it
- AND return HTTP 204.

### Requirement: Debt payment materialization

Debt payments SHALL create transactions through the existing transaction ledger path and update debt state atomically.

#### Scenario: User pays money they owe

- GIVEN an active `I_OWE` debt belongs to the active owner context
- WHEN an authorized owner or supervisor calls `POST /api/debts/:id/pay` with `walletId` and positive `amount`
- THEN the backend SHALL create an `EXPENSE` transaction through the ledger
- AND decrease `remaining` by `amount`
- AND mark the debt `PAID` when `remaining` reaches zero.

#### Scenario: User receives money owed to them

- GIVEN an active `OWED_TO_ME` debt belongs to the active owner context
- WHEN an authorized owner or supervisor calls `POST /api/debts/:id/pay` with `walletId` and positive `amount`
- THEN the backend SHALL create an `INCOME` transaction through the ledger
- AND decrease `remaining` by `amount`
- AND mark the debt `PAID` when `remaining` reaches zero.

#### Scenario: Debt payment fails

- GIVEN a debt payment starts mutating wallet balance and debt state
- WHEN any operation in the payment fails
- THEN the backend SHALL roll back both the transaction ledger mutation and the debt state mutation.
