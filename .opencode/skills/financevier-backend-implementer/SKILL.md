---
name: financevier-backend-implementer
description: Mandatory project instructions for implementing the FinanceVier backend from OpenSpec artifacts.
license: MIT
compatibility: FinanceVier backend project
---

# FinanceVier Backend Implementer Skill

Load this skill before implementing any backend task in this repository.

## Human Communication Is Spanish Only

Any message intended for the human user MUST be written in Spanish. This includes:

- Progress updates.
- Explanations.
- Blockers.
- Questions.
- Review notes.
- Task completion summaries.

English is allowed for code, identifiers, tests, internal OpenSpec docs, and implementation comments that are not meant as direct human-facing explanation. Prefer Spanish for rare explanatory code comments when the comment is primarily for the project owner.

## Required Context

Read these before editing:

- `openspec/project.md`
- `docs/IMPLEMENTER_START_HERE.md`
- `openspec/changes/implement-backend-mvp/proposal.md`
- `openspec/changes/implement-backend-mvp/design.md`
- `openspec/changes/implement-backend-mvp/tasks.md`
- `openspec/changes/implement-backend-mvp/test-plan.md`
- `openspec/specs/*/spec.md`

## Implementation Discipline

- Follow the task order in `openspec/changes/implement-backend-mvp/tasks.md`.
- Follow `openspec/changes/implement-backend-mvp/test-plan.md` for required tests.
- Use TDD for each new checkpoint: write/update tests first, then implement the smallest code that passes.
- Complete at most one checkpoint before pausing for review.
- A checkpoint contains 2 or 3 tasks.
- Do not mark a task complete until code and relevant tests are done.
- If a task needs an unresolved decision from `docs/OPEN_QUESTIONS.md`, stop and ask in Spanish.
- Keep changes minimal and aligned to the current checkpoint.
- Do not implement frontend/mobile scope unless a backend contract requires it.

## Security Gates

Never skip these controls:

- bcrypt password hashing.
- JWT `jti` claims.
- Redis-backed session validation.
- Redis-backed rate limiting for exposed auth endpoints.
- Zod request validation.
- Ownership checks for resource IDs.
- Delegation role enforcement.
- AES-256-GCM encryption for Google refresh tokens.
- ACID transactions and wallet row locks for balance mutations.
- Transaction history snapshots for financial changes.

## Pause Report

After a checkpoint, report in Spanish and wait:

```md
## Pausa de revisión

Completé el checkpoint <nombre>.

### Tareas completadas
- [x] <task>

### Verificación
- <commands/tests>

### QA manual
- <Bruno/curl checks, or "No aplica para este checkpoint">

### Riesgos
- <risks or "Sin riesgos abiertos detectados">

Espero revisión antes de continuar.
```
