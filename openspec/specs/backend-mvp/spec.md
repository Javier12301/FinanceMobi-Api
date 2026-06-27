# backend-mvp Specification

## Purpose

Define the checkpointed implementation and review workflow used to deliver the FinanceVier backend MVP safely across multiple agent/user review cycles.

## Requirements
### Requirement: Checkpointed implementation workflow

The backend MVP SHALL be implemented in checkpoints containing no more than three tasks before human/OpenSpec review.

#### Scenario: Checkpoint completed

- GIVEN the implementer completes the tasks in a checkpoint
- WHEN the checkpoint is complete
- THEN the implementer SHALL stop work
- AND report completed tasks, verification, and risks to the human in Spanish
- AND wait for explicit review approval before continuing.

### Requirement: Base specs are implementation contracts

The implementer SHALL treat every `openspec/specs/*/spec.md` file as an implementation contract.

#### Scenario: Task conflicts with a base spec

- GIVEN a task appears to conflict with a base spec
- WHEN the implementer detects the conflict
- THEN implementation SHALL pause
- AND the implementer SHALL ask for clarification in Spanish.

### Requirement: Open questions block irreversible decisions

The implementer SHALL consult `docs/OPEN_QUESTIONS.md` before making schema, security, deletion, or API contract decisions that are unresolved.

#### Scenario: Unresolved deletion policy

- GIVEN a task reaches wallet, transaction, attachment, or Drive deletion behavior
- AND the relevant policy is unresolved
- WHEN implementation would require choosing a behavior
- THEN the implementer SHALL stop and ask for clarification instead of guessing.

### Requirement: Spanish human-facing communication

All human-facing implementation communication SHALL be written in Spanish.

#### Scenario: Implementer pauses for review

- WHEN the implementer writes a progress update, blocker, explanation, or review request for the human
- THEN the message SHALL be in Spanish.
