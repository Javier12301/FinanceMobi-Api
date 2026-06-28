# budgets Specification

## Purpose

Enable users to define and manage monthly spending limits per owner and category.

## Requirements

### Requirement: Monthly category budgets

The backend SHALL let users define monthly spending limits per owner and category.

#### Scenario: Budget is created

- GIVEN a valid owner-scoped category and month in `YYYY-MM` format
- WHEN an authorized owner or supervisor calls `POST /api/budgets`
- THEN the backend SHALL create a budget with decimal `limit`
- AND return HTTP 201 with the created budget.

### Requirement: Budget listing

The backend SHALL list budgets for the active owner context.

#### Scenario: Owner lists budgets

- GIVEN the owner has budgets across months
- WHEN the frontend calls `GET /api/budgets`
- THEN the backend SHALL return only budgets for that owner context.

### Requirement: Budget uniqueness

The backend SHALL prevent duplicate budgets for the same owner, category, and month.

#### Scenario: Duplicate budget

- GIVEN a budget already exists for an owner, category, and month
- WHEN the client creates another budget for the same tuple
- THEN the backend SHALL reject the request with HTTP 409.

### Requirement: Budget mutation

The backend SHALL allow authorized updates and deletion of budgets.

#### Scenario: Budget limit changes

- GIVEN a budget belongs to the active owner context
- WHEN an authorized owner or supervisor calls `PUT /api/budgets/:id` with `limit`
- THEN the backend SHALL update the limit and return the updated budget.

#### Scenario: Budget is deleted

- GIVEN a budget belongs to the active owner context
- WHEN an authorized owner or supervisor calls `DELETE /api/budgets/:id`
- THEN the backend SHALL delete it and return HTTP 204.
