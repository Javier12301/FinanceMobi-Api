# wallets-categories Specification

## Purpose

Manage user wallets, wallet types, movement types, and categories used by financial transactions.

## Requirements

### Requirement: Wallet creation

The backend SHALL allow an authorized user to create a wallet with name, wallet type, optional description, and initial balance.

#### Scenario: Wallet is created

- GIVEN a valid wallet creation request
- WHEN the backend creates the wallet
- THEN `initialBalance` SHALL equal the submitted initial amount
- AND `currentBalance` SHALL initially equal `initialBalance`.

### Requirement: Wallet listing

The backend SHALL list wallets for the authenticated user's own account or the active delegated owner context.

#### Scenario: Owner lists wallets

- GIVEN a user owns wallets
- WHEN the user calls `GET /api/wallets`
- THEN the backend SHALL return only wallets owned by that user unless a valid delegated owner context is selected.

### Requirement: Wallet update

The backend SHALL allow authorized updates to wallet metadata without corrupting financial balances.

#### Scenario: Wallet name changes

- GIVEN an authorized user updates a wallet name
- WHEN the request is valid
- THEN the backend SHALL update metadata
- AND it SHALL NOT recalculate balances unless the operation explicitly requires it.

### Requirement: Wallet deletion requires a defined policy

The backend SHALL NOT delete wallets with financial history until the product deletion policy is resolved.

#### Scenario: Wallet has transactions

- GIVEN a wallet has transactions
- WHEN an authorized user requests deletion
- THEN the backend SHALL follow the approved deletion policy
- AND if no policy has been approved, implementation SHALL stop and ask for clarification.

### Requirement: Category ownership

Categories SHALL belong to a user and SHALL be scoped to that owner or delegated owner context.

#### Scenario: Category used in transaction

- GIVEN a transaction references a category
- WHEN the backend validates the transaction
- THEN the category SHALL belong to the same owner context as the affected wallet.

### Requirement: Lookup seed data

Wallet types and movement types SHALL be available as controlled lookup data.

#### Scenario: Database is seeded

- WHEN the seed process runs
- THEN it SHALL create required wallet types and movement types without duplicates.

### Requirement: Default categories for new users

The backend SHALL create default categories for each newly registered credential user.

#### Scenario: User registers successfully

- GIVEN a new user registers through `POST /api/auth/register`
- WHEN the user row is created
- THEN the backend SHALL create default `EXPENSE` categories named `Comida`, `Transporte`, `Servicios`, and `Ocio`
- AND SHALL create a default `INCOME` category named `Sueldo`
- AND SHALL create a default `TRANSFER` category named `Transferencia`.

### Requirement: Category visual metadata

Categories SHALL support optional frontend visual metadata fields `icon` and `color`.

#### Scenario: Category metadata is persisted

- GIVEN an authorized owner or supervisor submits `icon` and `color`
- WHEN the backend creates or updates a category
- THEN the backend SHALL persist the values
- AND return them in category responses.

#### Scenario: Invalid metadata is submitted

- GIVEN `icon` is outside the approved frontend catalog or `color` is not a hex color
- WHEN the backend validates the request
- THEN it SHALL reject the request with HTTP 400.

### Requirement: Category update

The backend SHALL allow authorized updates to category `name`, `icon`, and `color` without changing `movementType`.

#### Scenario: Category is updated

- GIVEN a category belongs to the active owner context
- WHEN an authorized owner or supervisor calls `PUT /api/categories/:id`
- THEN the backend SHALL update only submitted mutable fields
- AND preserve the existing `movementType`.

### Requirement: Category deletion policy

The backend SHALL reject deletion of categories that are referenced by financial history.

#### Scenario: Category has transactions

- GIVEN a category is referenced by one or more transactions
- WHEN an authorized user calls `DELETE /api/categories/:id`
- THEN the backend SHALL return HTTP 409
- AND leave the category unchanged.

#### Scenario: Category has no transactions

- GIVEN a category belongs to the active owner context and has no transactions
- WHEN an authorized owner or supervisor deletes it
- THEN the backend SHALL delete the category
- AND return HTTP 204.
