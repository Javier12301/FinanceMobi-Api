# delegation-authorization Specification

## Purpose

Allow users to delegate access to their financial account while preventing cross-account data leaks and unauthorized writes.

## Requirements

### Requirement: Delegation roles

The backend SHALL support `SUPERVISOR` and `ASESOR` delegation roles.

#### Scenario: Supervisor access

- GIVEN a user has accepted or active `SUPERVISOR` delegation for an owner
- WHEN the delegated user accesses the owner's active context
- THEN the delegated user MAY read and perform permitted write operations for that owner.

#### Scenario: Advisor access

- GIVEN a user has accepted or active `ASESOR` delegation for an owner
- WHEN the delegated user accesses the owner's active context
- THEN the delegated user MAY read the owner's data
- AND SHALL NOT create, update, or delete owner data.

### Requirement: Owner access

The owner SHALL have full access to their own wallets, transactions, attachments, Drive linkage, and delegations.

#### Scenario: Owner edits own wallet

- GIVEN the authenticated user owns a wallet
- WHEN the user updates that wallet
- THEN the backend SHALL allow the operation after validation.

### Requirement: Authorization chain

Protected resource endpoints SHALL apply authentication, role authorization, and ownership/resource validation before controller execution.

#### Scenario: Protected wallet mutation

- WHEN a user attempts to mutate a wallet
- THEN the request SHALL pass through authentication
- AND delegation/RBAC validation
- AND ownership guard validation
- BEFORE the controller mutates state.

### Requirement: IDOR prevention

The backend SHALL verify that every requested resource belongs to the active owner context or authenticated owner.

#### Scenario: Guessed wallet ID

- GIVEN a delegated user has access to owner A
- WHEN that user submits a wallet ID belonging to owner B
- THEN the backend SHALL reject the request even if the delegated role would otherwise permit the action.

### Requirement: Delegation uniqueness

The backend SHALL prevent duplicate delegations for the same owner and delegated user pair.

#### Scenario: Duplicate invitation

- GIVEN owner A already delegated access to user B
- WHEN owner A attempts to create the same delegation again
- THEN the backend SHALL reject or idempotently preserve a single delegation record.

### Requirement: Delegation revocation

The owner SHALL be able to revoke delegated access at any time.

#### Scenario: Owner revokes access

- GIVEN user B has delegated access to owner A
- WHEN owner A revokes that delegation
- THEN user B SHALL lose access to owner A's data for subsequent requests.
