## ADDED Requirements

### Requirement: Self-owner accounting reset
The system SHALL allow only the authenticated account owner to reset operational accounting data for that same owner.

#### Scenario: Reset retained wallets
- **WHEN** the owner submits a reset with retained wallets
- **THEN** transactions, attachments, histories, debts, recurring rules and budgets are removed and every retained wallet has zero balances

#### Scenario: Reset removed wallets
- **WHEN** the owner submits a reset with deleted wallets
- **THEN** the same operational data and all owner wallets are removed while categories, check-ins, delegations and account settings remain

#### Scenario: Delegated account denied
- **WHEN** a supervisor or advisor targets a delegated owner
- **THEN** the system rejects the reset
