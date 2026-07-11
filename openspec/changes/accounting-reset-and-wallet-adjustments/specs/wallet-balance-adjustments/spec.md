## ADDED Requirements

### Requirement: Auditable target-balance adjustment
The system SHALL reconcile an owner wallet to a signed target balance through a distinct ledger adjustment without changing income or expense analytics.

#### Scenario: Positive adjustment
- **WHEN** the owner sets a target balance above the current balance
- **THEN** the wallet is updated and an ADJUSTMENT ledger entry records the positive delta and resulting balance

#### Scenario: Negative adjustment
- **WHEN** the owner sets a target balance below the current balance
- **THEN** the wallet is updated and an ADJUSTMENT ledger entry records the negative delta and resulting balance
