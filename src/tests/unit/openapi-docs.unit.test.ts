import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  generateOpenApiYaml,
  syncOpenApiDoc,
} from "../../../scripts/generate-openapi-docs";

describe("openapi docs generator", () => {
  it("renders expected paths and schema details", async () => {
    const yaml = await generateOpenApiYaml();

    expect(yaml).toContain("openapi:");
    expect(yaml).toContain("/v1/publish/agents/{agentId}:");
    expect(yaml).toContain("/v1/agents/search:");
    expect(yaml).toContain("agent_card_url:");
    expect(yaml).toContain("type: string");
    expect(yaml).toContain("pattern: ^https://");
  });

  it("supports check mode for stale docs", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agenthub-openapi-docs-"));
    const outputPath = path.join(tempDir, "openapi.yaml");

    try {
      await writeFile(outputPath, "stale", "utf8");
      await expect(syncOpenApiDoc(outputPath, true)).resolves.toBe(false);

      await expect(syncOpenApiDoc(outputPath, false)).resolves.toBe(true);
      await expect(syncOpenApiDoc(outputPath, true)).resolves.toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
