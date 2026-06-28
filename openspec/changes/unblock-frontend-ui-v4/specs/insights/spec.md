## ADDED Requirements

### Requirement: Monthly insights

The backend SHALL expose owner-scoped monthly insight summaries at `GET /api/insights`.

#### Scenario: Insights are requested for a month

- GIVEN an active owner context and a valid `month=YYYY-MM` query
- WHEN the frontend calls `GET /api/insights`
- THEN the backend SHALL return `month`, `totalIncome`, `totalExpense`, `vsPreviousMonth`, `topCategories`, and `biggestExpense`
- AND monetary totals SHALL be serialized as strings.

#### Scenario: Month is omitted

- GIVEN an active owner context
- WHEN the frontend calls `GET /api/insights` without `month`
- THEN the backend SHALL use the current calendar month.

#### Scenario: No transactions exist

- GIVEN the owner has no transactions in the requested month or previous month
- WHEN insights are requested
- THEN the backend SHALL return zero totals, empty `topCategories`, and `biggestExpense = null`.
