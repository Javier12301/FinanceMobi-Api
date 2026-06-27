# delegation-authorization Specification

## ADDED Requirements

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
