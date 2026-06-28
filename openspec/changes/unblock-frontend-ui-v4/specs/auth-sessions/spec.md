## MODIFIED Requirements

### Requirement: Credential registration with automatic session

The backend SHALL allow users to register with name, email, and password, seed a usable default owner workspace, then automatically issue a normal system JWT session.

#### Scenario: Valid registration

- GIVEN a registration body with valid `name`, `email`, and `password` of at least 8 characters
- WHEN the client calls `POST /api/auth/register`
- THEN the backend SHALL create the user with a hashed password
- AND SHALL create one default `Efectivo` wallet with balance `0`
- AND SHALL create the default V4 category catalog with `icon` and `color`
- AND SHALL issue a Redis-backed JWT session
- AND SHALL return `{ "token": "<jwt>" }`.

#### Scenario: Registration seed is retried

- GIVEN the user already has wallets or categories
- WHEN onboarding seed logic runs again for the same owner
- THEN the backend SHALL NOT duplicate the default wallet or default categories.

#### Scenario: Duplicate email

- GIVEN a user already exists with the requested email
- WHEN the client calls `POST /api/auth/register` with that email
- THEN the backend SHALL reject the request with HTTP 409.
