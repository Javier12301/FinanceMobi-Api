# recurring-rules Specification

## Purpose

Support owner-scoped monthly recurring movement rules with flexible confirmation and auto-posting options.

## Requirements

### Requirement: Monthly recurring rule management

The backend SHALL support owner-scoped monthly recurring movement rules.

#### Scenario: Recurring rule is created

- GIVEN valid wallet, category, movement type, amount, day of month, and start date
- WHEN an authorized owner or supervisor calls `POST /api/recurring-rules`
- THEN the backend SHALL create a `RecurringRule`
- AND default omitted `frequency` to `MONTHLY`
- AND return HTTP 201 with the created rule.

#### Scenario: Recurring rules are listed

- GIVEN recurring rules exist for multiple owners
- WHEN the frontend calls `GET /api/recurring-rules`
- THEN the backend SHALL return only rules for the active owner context.

### Requirement: Recurring rule mutation

The backend SHALL allow authorized pause/resume and editable scheduling fields.

#### Scenario: Rule is updated

- GIVEN a rule belongs to the active owner context
- WHEN an authorized owner or supervisor calls `PUT /api/recurring-rules/:id`
- THEN the backend SHALL update submitted fields among `amount`, `dayOfMonth`, `autoPost`, `active`, and `endDate`.

#### Scenario: Rule is deleted

- GIVEN a rule belongs to the active owner context
- WHEN an authorized owner or supervisor calls `DELETE /api/recurring-rules/:id`
- THEN the backend SHALL delete or safely deactivate the rule
- AND return HTTP 204.

### Requirement: Pending recurring confirmation

The backend SHALL expose due non-auto recurring rules for frontend confirmation.

#### Scenario: Due rules are pending

- GIVEN active recurring rules have `nextRunDate <= now` and `autoPost = false`
- WHEN the frontend calls `GET /api/recurring-rules/pending`
- THEN the backend SHALL return those rules for the active owner context.

### Requirement: Recurring confirmation materializes a transaction

The backend SHALL confirm a due recurring rule by creating a transaction through the existing ledger path.

#### Scenario: Rule is confirmed

- GIVEN a due recurring rule belongs to the active owner context
- WHEN an authorized owner or supervisor calls `POST /api/recurring-rules/:id/confirm`
- THEN the backend SHALL create the corresponding transaction using the same ACID balance logic as manual creation
- AND advance `nextRunDate`
- AND return success.

#### Scenario: Confirmation would duplicate an occurrence

- GIVEN the same due occurrence has already been materialized
- WHEN confirmation is retried
- THEN the backend SHALL avoid creating a duplicate transaction.
