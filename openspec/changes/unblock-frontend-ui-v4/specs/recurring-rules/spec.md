## ADDED Requirements

### Requirement: Installment debt recurring linkage

The backend SHALL link installment debts to recurring rules when it implements installment reminders, so those reminders use the existing recurring confirmation flow.

#### Scenario: Debt with installments is created

- GIVEN a debt is created with `installmentsTotal`
- WHEN the backend chooses to create a recurring rule
- THEN it SHALL store the recurring rule identifier on `Debt.recurringRuleId`
- AND SHALL NOT create a separate scheduler for debt installments.
