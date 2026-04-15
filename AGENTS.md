# AGENTS.md

## Purpose

- This repo is the reference implementation of [caelaxie/agenthub-spec](https://github.com/caelaxie/agenthub-spec).
- The spec repo is canonical for public API and product behavior.
- If code in this repo differs from the spec, treat it as an implementation gap to fix, not alternate policy.

## Source Of Truth

- Follow `agenthub-spec` for registry contract, lifecycle, data model, and endpoint behavior.
- Keep local implementation, shared schemas, OpenAPI output, and tests aligned with that contract.
- Do not invent public behavior locally unless the user explicitly asks to change the spec as well.

## Repo Map

- `src/modules/*`: publication, verification, discovery, and route/service logic.
- `src/common/types/api.ts`: shared request and response schemas.
- `src/app.ts`: app wiring, plugins, route registration, and error handling.

## Commands

- `bun run dev`
- `bun test`
- `bun run db:generate`
- `bun run db:migrate`

## Change Rules

- For any public-contract change, update implementation, schemas/OpenAPI, and tests in the same task.
- Keep placeholder behavior explicit. Missing features should fail as not implemented, not silently redefine the contract.
- Use Context7 for external library or API documentation.

## Validation Bar

- Verify referenced commands and paths still exist.
- Keep OpenAPI and typed schemas consistent with implemented routes.
- Prefer regression tests when fixing contract or behavior bugs.
