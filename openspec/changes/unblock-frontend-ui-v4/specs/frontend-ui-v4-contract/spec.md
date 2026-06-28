## ADDED Requirements

### Requirement: V4 retention backend contract

The backend SHALL expose the retention-oriented contracts required by the V4 frontend while preserving graceful degradation for unimplemented optional features.

#### Scenario: High-priority V4 endpoints are available

- GIVEN the frontend calls V4 high-priority endpoints
- WHEN the backend has implemented this change
- THEN `/api/me/stats`, `/api/debts`, `/api/me/devices`, and `/api/me/notification-prefs` SHALL respond according to their capability specs.

#### Scenario: Medium-priority V4 endpoints are available

- GIVEN the frontend calls V4 medium-priority endpoints
- WHEN the backend has implemented this change
- THEN `/api/insights` and filtered `/api/transactions` SHALL respond according to their capability specs.

### Requirement: Deferred V4 features remain explicit

Templates, OCR receipt parsing, push-provider delivery, and multi-currency SHALL remain out of implementation scope unless a later OpenSpec change approves them.

#### Scenario: Deferred endpoint is requested

- GIVEN a deferred V4 endpoint is requested
- WHEN the backend has no approved change for it
- THEN the backend MAY return HTTP 404 or 501
- AND the frontend SHALL be able to keep its empty or disabled state.
