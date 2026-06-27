# auth-sessions Specification

## Purpose

Authenticate users through credentials or Google SSO and maintain revocable JWT sessions backed by Redis.

## Requirements

### Requirement: Credential login

The backend SHALL authenticate users with email and password using bcrypt password verification.

#### Scenario: Valid credentials

- GIVEN a user exists with a bcrypt password hash
- WHEN the user submits the correct email and password to `POST /api/auth/login`
- THEN the backend SHALL issue a system JWT
- AND it SHALL create a Redis session for that JWT.

#### Scenario: Invalid credentials

- GIVEN a login request has an unknown email or wrong password
- WHEN the backend validates credentials
- THEN it SHALL reject the request without revealing which field was incorrect.

### Requirement: Google SSO login

The backend SHALL accept a Google `id_token`, verify it with Google, identify or create the user, and issue its own system JWT.

#### Scenario: First Google login

- GIVEN Google returns a valid `id_token` containing `sub` and `email`
- WHEN the backend receives it at `POST /api/auth/google`
- THEN it SHALL create a user if one does not exist
- AND it SHALL discard the Google identity token after verification
- AND it SHALL issue a system JWT backed by Redis.

### Requirement: JWT jti session identity

Every issued JWT SHALL include a unique `jti` claim.

#### Scenario: Two sessions for one user

- GIVEN the same user logs in from two devices
- WHEN the backend issues two JWTs
- THEN each token SHALL contain a different `jti`
- AND Redis SHALL contain separate `session:{userId}:{jti}` keys.

### Requirement: Redis-backed session validation

Protected endpoints SHALL require both a valid JWT signature and an existing Redis session key.

#### Scenario: Revoked token is reused

- GIVEN a JWT signature is valid
- AND the matching Redis session key no longer exists
- WHEN the token is used on a protected endpoint
- THEN the backend SHALL reject the request as unauthenticated.

### Requirement: Single-session logout

Logout SHALL revoke only the current JWT session by deleting `session:{userId}:{jti}`.

#### Scenario: User logs out on one device

- GIVEN a user has multiple active Redis sessions
- WHEN the user calls `POST /api/auth/logout` with one JWT
- THEN the backend SHALL delete only the Redis key matching that token `jti`
- AND the other sessions SHALL remain valid.

### Requirement: Session TTL alignment

Redis session TTL SHALL match the JWT expiration duration.

#### Scenario: Token expires

- GIVEN a JWT expires after the configured duration
- WHEN the matching Redis session is created
- THEN its TTL SHALL equal the JWT lifetime in seconds.

### Requirement: Auth rate limiting

Authentication endpoints SHALL be protected by Redis-backed rate limiting.

#### Scenario: Repeated login attempts

- GIVEN a client exceeds the configured login attempt limit
- WHEN it calls `POST /api/auth/login`
- THEN the backend SHALL reject the request with a rate-limit response
- AND the counter SHALL be shared through Redis.

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
