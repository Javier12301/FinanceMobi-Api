# frontend-ui-v3-contract Specification

## Purpose

Define the backend contract required by frontend V3 features that are already wired for graceful degradation until backend endpoints become available.

## Requirements

### Requirement: Frontend V3 dormant features are backed by real endpoints

The backend SHALL expose the endpoints already wired by the V3 frontend so the UI no longer depends on graceful `404` or `501` fallback for approved roadmap features.

#### Scenario: Frontend requests V3 resources

- GIVEN the authenticated frontend calls recurring, budget, category-management, or Drive connection endpoints
- WHEN the feature is included in this change
- THEN the backend SHALL return the documented contract response instead of `404` or `501`.

### Requirement: Owner context remains consistent

V3 owner-scoped endpoints SHALL use the same authenticated owner/delegation context as wallets and transactions.

#### Scenario: Delegated supervisor mutates an owner resource

- GIVEN a `SUPERVISOR` has active delegated access to an owner
- WHEN the request includes `Authorization` and `X-Owner-Id`
- THEN the backend SHALL authorize the mutation only inside that owner context.

#### Scenario: Advisor attempts mutation

- GIVEN an `ASESOR` has active delegated access
- WHEN the advisor calls a V3 mutating endpoint
- THEN the backend SHALL reject the request.
