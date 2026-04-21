import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  generateDatabaseSchemaMarkdown,
  syncDatabaseSchemaDoc,
} from "../../../scripts/generate-db-schema-docs";

describe("database schema docs generator", () => {
  it("renders expected tables, indexes, enums, and mermaid relationships", () => {
    const markdown = generateDatabaseSchemaMarkdown();

    expect(markdown).toContain("### `agent_publications`");
    expect(markdown).toContain("## Indexes");
    expect(markdown).toContain("## Enums");
    expect(markdown).toContain(
      "| `agent_publications` | `agent_publications_source_url_active_idx` | Yes | `source_url` | `\"agent_publications\".\"status\" = 'active'` |",
    );
    expect(markdown).toContain(
      "agent_publications ||--|| agent_snapshots : \"agent_id\"",
    );
    expect(markdown).toContain(
      "agent_publications ||--|| verification_challenges : \"agent_id\"",
    );
    expect(markdown).not.toContain("agent_publications ||--|| namespaces");
  });

  it("supports check mode for stale docs", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agenthub-db-docs-"));
    const outputPath = path.join(tempDir, "database-schema.md");

    try {
      await writeFile(outputPath, "stale", "utf8");
      await expect(syncDatabaseSchemaDoc(outputPath, true)).resolves.toBe(false);

      await expect(syncDatabaseSchemaDoc(outputPath, false)).resolves.toBe(true);
      await expect(syncDatabaseSchemaDoc(outputPath, true)).resolves.toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
