## ADDED Requirements

### Requirement: Adjustment ledger classification
The ledger SHALL display ADJUSTMENT records while excluding them from income, expense, budget, and insight aggregates.

#### Scenario: Aggregate query contains an adjustment
- **WHEN** a wallet has an adjustment record in the selected period
- **THEN** its balance reflects the adjustment and financial aggregates do not classify it as income or expense
