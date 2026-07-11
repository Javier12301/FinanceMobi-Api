## ADDED Requirements

### Requirement: Wallet adjustment API
The wallet API SHALL expose an authenticated owner-context action for target-balance adjustments.

#### Scenario: Owner adjustment request
- **WHEN** an owner submits a valid target balance for an owned wallet
- **THEN** the API returns the created adjustment record
