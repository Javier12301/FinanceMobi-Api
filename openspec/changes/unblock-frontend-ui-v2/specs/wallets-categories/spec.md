# wallets-categories Specification

## ADDED Requirements

### Requirement: Default categories for new users

The backend SHALL create default categories for each newly registered credential user.

#### Scenario: User registers successfully

- GIVEN a new user registers through `POST /api/auth/register`
- WHEN the user row is created
- THEN the backend SHALL create default `EXPENSE` categories named `Comida`, `Transporte`, `Servicios`, and `Ocio`
- AND SHALL create a default `INCOME` category named `Sueldo`
- AND SHALL create a default `TRANSFER` category named `Transferencia`.
