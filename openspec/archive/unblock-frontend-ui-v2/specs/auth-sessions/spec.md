# auth-sessions Specification

## ADDED Requirements

### Requirement: Credential registration with automatic session

The backend SHALL allow users to register with name, email, and password, then automatically issue a normal system JWT session.

#### Scenario: Valid registration

- GIVEN a registration body with valid `name`, `email`, and `password` of at least 8 characters
- WHEN the client calls `POST /api/auth/register`
- THEN the backend SHALL create the user with a hashed password
- AND SHALL create the user's default categories
- AND SHALL issue a Redis-backed JWT session
- AND SHALL return `{ "token": "<jwt>" }`.

#### Scenario: Duplicate email

- GIVEN a user already exists with the requested email
- WHEN the client calls `POST /api/auth/register` with that email
- THEN the backend SHALL reject the request with HTTP 409.

### Requirement: Authenticated profile endpoint

The backend SHALL expose `GET /api/me` for the authenticated user profile and Drive connection status.

#### Scenario: Authenticated profile request

- GIVEN the client has a valid JWT session
- WHEN it calls `GET /api/me`
- THEN the backend SHALL return the authenticated user's `id`, `name`, `email`, and `driveConnected` boolean.

#### Scenario: Drive connection status

- GIVEN the authenticated user has an encrypted Google refresh token and Drive folder ID
- WHEN the backend builds the `/api/me` response
- THEN `driveConnected` SHALL be `true`.
