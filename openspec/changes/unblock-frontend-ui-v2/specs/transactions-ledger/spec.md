# transactions-ledger Specification

## ADDED Requirements

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
