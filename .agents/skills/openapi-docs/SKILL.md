---
name: openapi-docs
description: Use when editing public routes, shared request or response schemas, OpenAPI metadata, route tags, or when asked to document or export the API spec. Keeps `docs/openapi.yaml` in sync by running the repo generator and check commands.
---

# OpenAPI Docs

The source of truth is the app's runtime OpenAPI output at `/docs/openapi.json`, generated through `@elysiajs/openapi`.

When the public API changes:

1. Update the routes, schemas, or OpenAPI metadata first.
2. Run `bun run docs:openapi`.
3. Review `docs/openapi.yaml` for expected paths, request and response schemas, and metadata.
4. Run `bun run docs:openapi:check` before finishing.
5. Keep API implementation, schema changes, and doc updates in the same change.

Use this skill when the user asks for OpenAPI docs, an exported API spec, or API reference material under `docs/`.
