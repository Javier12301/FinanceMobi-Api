## ADDED Requirements

### Requirement: Device token registration

The backend SHALL allow authenticated users to register and delete notification device tokens without owner context.

#### Scenario: Device token is registered

- GIVEN an authenticated user submits `token` and `platform`
- WHEN the client calls `POST /api/me/devices`
- THEN the backend SHALL persist the token for that user
- AND SHALL allow the same user to have multiple different device tokens
- AND SHALL prevent duplicate records for the same `(userId, token)`
- AND return the stored device record.

#### Scenario: Device token is deleted

- GIVEN an authenticated user has a stored device token
- WHEN the client calls `DELETE /api/me/devices/:token`
- THEN the backend SHALL delete only that user's matching token
- AND return HTTP 204.

### Requirement: Notification preferences

The backend SHALL expose notification preferences for the authenticated user.

#### Scenario: Preferences are read for the first time

- GIVEN an authenticated user has no stored notification preferences
- WHEN the client calls `GET /api/me/notification-prefs`
- THEN the backend SHALL return defaults with daily reminders enabled at `21:00`, budget alerts enabled, and recurring alerts enabled.

#### Scenario: Preferences are updated

- GIVEN an authenticated user submits valid notification preference fields
- WHEN the client calls `PUT /api/me/notification-prefs`
- THEN the backend SHALL persist and return the updated preferences.

### Requirement: Notification candidates

The backend SHALL provide service-level notification candidate calculation for daily reminders, due manual recurring rules, budget thresholds, and streak risk without exposing a public endpoint in V4.

#### Scenario: Manual recurring rules are due

- GIVEN a user has due `autoPost=false` recurring rules and recurring alerts enabled
- WHEN notification candidates are calculated
- THEN the backend SHALL include a recurring confirmation notification candidate for that user's devices.

#### Scenario: Candidate endpoint is requested

- GIVEN the V4 backend implements notification candidate calculation
- WHEN a client requests a public notification-candidates endpoint
- THEN the backend MAY return HTTP 404 or 501 unless a later OpenSpec change approves that API.
