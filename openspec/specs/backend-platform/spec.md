# backend-platform Specification

## Purpose

Define the backend runtime, project structure, validation, observability, and deployment baseline for FinanceVier.

## Requirements

### Requirement: TypeScript Express backend

The backend SHALL be implemented with Node.js, Express, and TypeScript.

#### Scenario: Server starts successfully

- GIVEN the backend environment is configured
- WHEN the backend process starts
- THEN it SHALL listen on the configured `PORT`
- AND it SHALL expose API routes under `/api/*`.

### Requirement: Vertical feature slicing

Backend business modules SHALL be organized by feature under `src/features/*`, while shared technical infrastructure SHALL live under `src/core/*`.

#### Scenario: Add a new business module

- GIVEN a developer adds a backend capability
- WHEN the module contains routes, controller logic, service logic, validation schemas, or local types
- THEN those files SHALL be placed under the relevant `src/features/<feature>/` directory.

### Requirement: Health endpoint

The backend SHALL expose `GET /api/health` for Docker and proxy health checks.

#### Scenario: Health check succeeds

- WHEN a client calls `GET /api/health`
- THEN the backend SHALL return HTTP 200
- AND the response body SHALL include `{ "status": "ok" }`.

### Requirement: Request validation

The backend SHALL validate incoming request bodies, params, and query strings with Zod before business logic runs.

#### Scenario: Invalid input is rejected

- GIVEN a request does not match the endpoint schema
- WHEN the validation middleware runs
- THEN the request SHALL be rejected with HTTP 400
- AND the controller SHALL NOT execute.

### Requirement: Centralized error handling

The backend SHALL use centralized error handling for unhandled errors and known domain errors.

#### Scenario: Unexpected error occurs

- GIVEN a route throws an unexpected error
- WHEN the error handler catches it
- THEN the backend SHALL log the error
- AND the client SHALL receive a JSON error response without internal stack traces.

### Requirement: Structured request logging

The backend SHALL log method, path, status, duration, and client IP for incoming requests.

#### Scenario: Request passes through Nginx

- GIVEN Nginx forwards `X-Forwarded-For` and `X-Real-IP`
- WHEN the backend logs the request
- THEN the log SHOULD use the original client IP rather than the proxy container IP.

### Requirement: Docker Compose service health

The deployment SHALL use health checks so dependent services start only when prerequisites are healthy.

#### Scenario: Backend waits for MySQL and Redis

- GIVEN Docker Compose starts all services
- WHEN MySQL or Redis is not healthy yet
- THEN the backend SHALL NOT be considered ready
- AND dependent services SHALL wait for backend health before starting when configured.

### Requirement: Nginx API routing

Nginx SHALL route `/api/*` traffic to the backend without stripping the `/api` prefix.

#### Scenario: API request through proxy

- WHEN a client requests `/api/wallets`
- THEN Nginx SHALL forward the path to the backend as `/api/wallets`.
