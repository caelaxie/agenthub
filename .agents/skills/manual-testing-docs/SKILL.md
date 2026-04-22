---
name: manual-testing-docs
description: Use when editing `docs/manual-testing.md` or other local manual QA runbooks. Keeps instructions copy-pasteable, test-friendly, step-ordered, and aligned with the current implementation, route tests, and exact status or error codes.
---

# Manual Testing Docs

The main source of truth is the implemented behavior in:

- `src/tests/integration/routes.integration.test.ts`
- `src/tests/unit/services.unit.test.ts`
- `src/common/types/api.ts`
- `docs/openapi.yaml`

When updating `docs/manual-testing.md`:

1. Lead with the fastest recommended local flow. A new contributor should be able to run it top to bottom without deciding which path to follow.
2. Always include a table of contents near the top of the document, and keep it in sync with the actual headings.
3. Prefer a linear runbook over a long reference document. Use one primary happy path, then separate focused sections for extra checks.
4. Keep requests copy-pasteable. Show full `curl` commands or full HTTP examples with literal headers and example values.
5. For each scenario, make three things obvious:
   - what to run
   - what success looks like
   - what the next step is
6. Use exact status codes and exact `error.code` values from the implementation. Remove stale placeholder or speculative behavior.
7. Make prerequisites explicit, especially which local processes must be running and which command belongs in which terminal.
8. Keep auth guidance concrete. In this repo, the raw `Authorization` header value matters for owner checks, so say that plainly.
9. For negative-path checks, state the required setup to reproduce the condition instead of assuming the reader already has the right DB state.
10. Prefer short sections, short bullets, and scannable headings. If a rewrite improves clarity, a full rewrite is acceptable.
11. Before finishing, scan for stale table-of-contents links, old route behavior claims, and commands that no longer match the repo.
