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

### Requirement: Delegation listing contract

The backend SHALL expose `GET /api/delegations` returning active delegations in the frontend contract shape.

#### Scenario: User lists delegations

- GIVEN the authenticated user has granted access to one user and received access from another owner
- WHEN the client calls `GET /api/delegations`
- THEN the response SHALL include `granted` entries for users who can access the authenticated user's account
- AND SHALL include `managing` entries for owner accounts the authenticated user can access
- AND each entry SHALL include `id`, `role`, and `user` with `id`, `name`, and `email`.

### Requirement: Immediate delegation creation

The backend SHALL allow an owner to create an active delegation immediately by delegated user email.

#### Scenario: Owner delegates access

- GIVEN the authenticated owner sends a valid delegated user email and role
- WHEN the client calls `POST /api/delegations`
- THEN the backend SHALL create an active delegation immediately
- AND return HTTP 201.

#### Scenario: Delegated email does not exist

- GIVEN no user exists with the requested delegated email
- WHEN the owner calls `POST /api/delegations`
- THEN the backend SHALL reject the request with HTTP 404.

#### Scenario: Duplicate active delegation

- GIVEN an active delegation already exists for the owner and delegated user pair
- WHEN the owner attempts to create the same delegation again
- THEN the backend SHALL reject the request with HTTP 409.

#### Scenario: Self delegation

- GIVEN the requested delegated email belongs to the owner
- WHEN the owner calls `POST /api/delegations`
- THEN the backend SHALL reject the request.

### Requirement: Soft delegation revocation

The backend SHALL revoke delegations by setting `active = false` instead of deleting the row.

#### Scenario: Owner revokes delegation

- GIVEN an active delegation granted by the owner exists
- WHEN the owner calls `DELETE /api/delegations/:id`
- THEN the backend SHALL set `active` to `false`
- AND return HTTP 204
- AND subsequent owner-context requests through that delegation SHALL be rejected.
