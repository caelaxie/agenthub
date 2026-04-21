---
name: db-schema-docs
description: Use when editing `src/lib/db.ts`, generating Drizzle migrations, changing database tables, indexes, enums, or foreign keys, or when asked to document the SQL schema or Mermaid ERD. Keeps `docs/database-schema.md` in sync by running the repo generator and check commands.
---

# DB Schema Docs

The source of truth is `src/lib/db.ts`.

When the schema changes:

1. Update `src/lib/db.ts` and any migrations first.
2. Run `bun run docs:db-schema`.
3. Review `docs/database-schema.md` for:
   - table columns, defaults, and keys
   - indexes, including partial indexes
   - foreign keys
   - Mermaid ERD relationships
4. Run `bun run docs:db-schema:check` before finishing.
5. Keep the schema, migration, and doc updates in the same change.

Use this skill when the user asks for a table list, index list, or Mermaid diagram of the SQL schema.
