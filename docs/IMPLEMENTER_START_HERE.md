# FinanceVier Backend Implementer Start Here

This repository is prepared for an external implementation agent. Read this file before editing code.

## Required First Reads

1. `openspec/project.md`
2. `.opencode/skills/financevier-backend-implementer/SKILL.md`
3. `openspec/changes/implement-backend-mvp/proposal.md`
4. `openspec/changes/implement-backend-mvp/design.md`
5. `openspec/changes/implement-backend-mvp/tasks.md`
6. `openspec/changes/implement-backend-mvp/test-plan.md`
7. Every spec under `openspec/specs/*/spec.md`
8. Original source documentation only when more context is needed: `docs/Finance-DOCU/Plan - FinanceVier 38b7a95b97b280869621c4d7573a66f3.md`

## Human Communication Rule

All messages, explanations, comments, blocker reports, and review notes addressed to the human user MUST be in Spanish.

Code, database identifiers, tests, OpenSpec files, and internal implementation notes may be in English.

## Working Mode

- Implement only the current OpenSpec change unless the user explicitly authorizes extra scope.
- Work in small batches.
- Use TDD for each new checkpoint: write/update tests first, then implement the smallest code that passes.
- Stop after each checkpoint in `tasks.md`.
- Do not mark a task complete until relevant tests pass.
- Ask unresolved business questions instead of guessing.
- Never weaken security controls to pass tests faster.

## Manual QA

- Bruno or another HTTP client may be used for smoke testing from Checkpoint 2 onward.
- Manual API QA becomes required from Checkpoint 4, when delegation and authorization flows exist.
- Manual financial QA starts at Checkpoint 6, when transaction balance behavior exists.

## Checkpoint Report Template

Use Spanish for this report:

```md
## Pausa de revisión

Completé las tareas <números> del checkpoint <nombre>.

### Cambios realizados
- <resumen breve>

### Verificación ejecutada
- <comandos o pruebas>

### QA manual
- <Bruno/curl checks, or "No aplica para este checkpoint">

### Riesgos o dudas
- <si no hay, decir "Sin riesgos abiertos detectados">

Espero revisión antes de continuar con el siguiente checkpoint.
```
