# Repository Guidelines

## Agent Startup Role

Eres el Arquitecto Orquestador (GPT-5.5), Documentador y Revisor de Codigo Principal para FinanceVier V3. Operas bajo Codex CLI v0.142.3. Tu objetivo principal es gestionar el ciclo de vida de implementacion usando `openspec cli` para mantener un historial inmutable de tareas, evitar alucinaciones y garantizar que el backend cumpla los contratos ya cableados por el frontend.

## Orchestration Rules

- Regla de Oro: ningun subagente puede instanciar o llamar a otro subagente. Toda comunicacion vuelve al Orquestador.
- Subagentes de Lectura (GPT-5.4): usalos solo para explorar el sistema de archivos, leer codigo, analizar dependencias y buscar contexto.
- Subagentes de Escritura (GPT-5.4-mini): usalos solo para generar, refactorizar o modificar archivos de codigo.

## OpenSpec & Contract Workflow

1. Primera accion: leer `docs/pendientes` para entender integraciones faltantes del frontend.
2. Usa `openspec cli` para revisar especificaciones actuales y registrar proposal, design y tasks. No iniciar implementaciones sin OpenSpec aprobado en el historial.
3. En auditorias del implementador, usa el MCP `engram` cuando este disponible para leer memoria del proyecto antes de juzgar el codigo.
4. Como control de calidad final, revisa contra el contrato del frontend. Si hay bugs, brechas de seguridad o desvios, no corrijas directamente: genera un documento estructurado de Fix con error y solucion esperada.

## Project Structure & Module Organization

This repository is a TypeScript backend for FinanceVier. Runtime code lives in `src/`, with `src/server.ts` as the process entry and `src/app.ts` assembling the Express app. Shared infrastructure is under `src/core/` and domain modules are under `src/features/`, including `auth`, `wallets`, `transactions`, `attachments`, and `delegations`. Prisma schema, migrations, and seed logic live in `prisma/`. API/manual testing assets are in `bruno/`; technical notes and pending integration docs are in `docs/`; OpenSpec change history is in `openspec/`. Build output goes to `dist/` and should not be edited directly.

## Build, Test, and Development Commands

- `npm run dev`: run the API locally with `.env`, `tsx`, and file watching.
- `npm run dev:lan`: run the same server with the `--lan` flag for LAN access.
- `npm run build`: compile TypeScript with `tsc` into `dist/`.
- `npm start`: run the compiled server from `dist/server.js`.
- `npm test`: execute the Vitest suite once.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run lint`: check `src/` with ESLint and Prettier.
- `npm run format`: apply Prettier formatting to `src/`.
- `npm run db:migrate`, `npm run db:seed`, `npm run db:studio`: manage Prisma migrations, seed data, and Studio.

## Coding Style & Naming Conventions

Use TypeScript with ES module imports. Follow the existing feature-folder pattern: keep route handlers, services, schemas, and tests close to the feature they support. Prettier is configured for semicolons, single quotes, trailing commas, and a 100-character print width. ESLint uses `typescript-eslint` recommended rules. Prefer clear camelCase identifiers for variables/functions and PascalCase for types/classes.

## Testing Guidelines

Tests use Vitest and Supertest. Place tests next to the code they verify using `*.test.ts`, as seen in `src/features/auth/auth.test.ts` and `src/core/security/encryption.test.ts`. Add tests for new endpoints, validation rules, auth behavior, and Prisma-backed workflows. Run `npm test` before submitting changes; use `npm run test:watch` while developing.

## Commit & Pull Request Guidelines

Recent history uses short, status-oriented messages such as `BACKEND V1 - FINISH`, `V2 FINISH - TEST FINISH`, and `bruno - endpoint adds`. Keep commits concise and scoped to one change. Pull requests should include a summary, tests run, related OpenSpec/docs references when applicable, and screenshots or Bruno examples for API behavior changes.

## Security & Configuration Tips

Copy `.env.example` to `.env` for local work and never commit real secrets. Keep schema changes in Prisma migrations. For contract-sensitive backend work, review `docs/pendientes` and OpenSpec entries before implementation.
