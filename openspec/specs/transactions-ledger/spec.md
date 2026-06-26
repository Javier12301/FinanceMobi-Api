# transactions-ledger Specification

## Purpose

Record income, expenses, and transfers while keeping wallet balances consistent and preserving an audit trail.

## Requirements

### Requirement: Positive transaction amounts

Transactions SHALL use positive decimal amounts and derive balance direction from movement type.

#### Scenario: Negative amount submitted

- WHEN a client submits a transaction amount less than or equal to zero
- THEN the backend SHALL reject the request.

### Requirement: Income transaction

The backend SHALL record income as a positive increase to the selected wallet balance.

#### Scenario: Income is created

- GIVEN a wallet has current balance 100.00
- WHEN an authorized user records income of 25.00
- THEN the backend SHALL create the transaction
- AND the wallet current balance SHALL become 125.00.

### Requirement: Expense transaction

The backend SHALL record expenses as a positive decrease from the selected wallet balance.

#### Scenario: Expense is created

- GIVEN a wallet has current balance 100.00
- WHEN an authorized user records an expense of 25.00
- THEN the backend SHALL create the transaction
- AND the wallet current balance SHALL become 75.00 unless negative balances are disallowed by resolved policy.

### Requirement: Transfer transaction

Transfers SHALL be represented by one transaction row using `walletId` as source and `destinationWalletId` as destination.

#### Scenario: Transfer is created

- GIVEN source wallet balance is 100.00
- AND destination wallet balance is 10.00
- WHEN an authorized user transfers 25.00
- THEN the backend SHALL create one transfer transaction
- AND source balance SHALL become 75.00
- AND destination balance SHALL become 35.00.

### Requirement: Atomic balance mutation

Transaction create, update, and delete operations SHALL mutate affected wallet balances inside a database transaction.

#### Scenario: Balance update fails

- GIVEN the backend starts creating a transaction
- WHEN any database operation in the balance mutation fails
- THEN all changes in that operation SHALL be rolled back.

### Requirement: Wallet row locking

The backend SHALL lock affected wallet rows before mutating balances to prevent race conditions.

#### Scenario: Concurrent writes

- GIVEN two authorized users create transactions against the same wallet at the same time
- WHEN the backend processes both requests
- THEN wallet balance mutations SHALL be serialized through row locks
- AND the final balance SHALL reflect both transactions exactly once.

### Requirement: Transaction filters

The backend SHALL support transaction listing filters for wallet, date range, and category.

#### Scenario: Filter by wallet

- WHEN a user lists transactions with `walletId`
- THEN the backend SHALL return only authorized transactions associated with that wallet.

### Requirement: Full snapshot audit history

Transaction modifications SHALL create `TransactionHistory` entries with full old and new JSON snapshots.

#### Scenario: Transaction category changes

- GIVEN an existing transaction
- WHEN an authorized user changes its category
- THEN the backend SHALL store the previous full transaction state in `oldSnapshot`
- AND the resulting full state in `newSnapshot`.

### Requirement: Delete behavior requires a defined policy

The backend SHALL NOT implement irreversible transaction deletion until the deletion/audit policy is resolved.

#### Scenario: Delete requested before policy resolution

- GIVEN transaction deletion behavior is not approved
- WHEN implementation reaches delete behavior
- THEN implementation SHALL stop and ask for clarification.
