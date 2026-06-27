# frontend-ui-v2-contract Specification

## ADDED Requirements

### Requirement: Frontend blocking endpoints

The backend SHALL expose the endpoints required by the current frontend UI to avoid controlled error placeholders for core flows.

#### Scenario: UI calls registration and delegation endpoints

- GIVEN the frontend register and settings screens are available
- WHEN the user registers or manages delegations
- THEN the backend SHALL provide matching API endpoints instead of returning 404.

### Requirement: Spanish human-facing implementation reports

The implementer SHALL continue reporting checkpoint status, blockers, questions, and QA notes to the human in Spanish.

#### Scenario: Checkpoint pause

- WHEN the implementer pauses after a checkpoint
- THEN the report SHALL be written in Spanish.
