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

### Requirement: Transaction deletion with balance reversal

The backend SHALL support transaction deletion by reversing balances, recording audit history, and deleting the transaction inside a database transaction.

#### Scenario: Income transaction deleted

- GIVEN an income transaction increased a wallet balance
- WHEN an authorized owner or supervisor deletes that transaction
- THEN the backend SHALL decrease the wallet balance by the transaction amount
- AND create a `TransactionHistory` entry with `action = 'DELETE'`
- AND delete the transaction row
- AND return HTTP 204.

#### Scenario: Expense transaction deleted

- GIVEN an expense transaction decreased a wallet balance
- WHEN an authorized owner or supervisor deletes that transaction
- THEN the backend SHALL increase the wallet balance by the transaction amount
- AND create a `TransactionHistory` entry with `action = 'DELETE'`
- AND delete the transaction row
- AND return HTTP 204.

#### Scenario: Transfer transaction deleted

- GIVEN a transfer transaction moved money from source wallet to destination wallet
- WHEN an authorized owner or supervisor deletes that transaction
- THEN the backend SHALL increase the source wallet balance by the transaction amount
- AND decrease the destination wallet balance by the transaction amount
- AND create a `TransactionHistory` entry with `action = 'DELETE'`
- AND delete the transaction row
- AND return HTTP 204.

### Requirement: Transaction deletion cleans up attachments

The backend SHALL delete Google Drive files for all transaction attachments before deleting the transaction and attachment database rows.

#### Scenario: Transaction with attachments deleted

- GIVEN a transaction has one or more attachments
- WHEN an authorized owner or supervisor deletes the transaction
- THEN the backend SHALL delete each attachment file from Google Drive before mutating database state
- AND delete the related `TransactionAttachment` rows inside the database transaction.

#### Scenario: Drive cleanup fails

- GIVEN any attachment Drive deletion fails
- WHEN transaction deletion is requested
- THEN the backend SHALL leave balances, transaction rows, and attachment rows unchanged
- AND return an error.
