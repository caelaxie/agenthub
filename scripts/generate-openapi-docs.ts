import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { stringify } from "yaml";

import { buildApp } from "../src/app";
import { DOCS_JSON_PATH } from "../src/config/constants";

const DEFAULT_OUTPUT_PATH = path.join(import.meta.dir, "..", "docs", "openapi.yaml");

const OPENAPI_REQUEST_URL = `http://localhost${DOCS_JSON_PATH}`;

const normalizeTrailingNewline = (value: string): string =>
  value.endsWith("\n") ? value : `${value}\n`;

export const generateOpenApiYaml = async (): Promise<string> => {
  const app = buildApp();
  const response = await app.handle(new Request(OPENAPI_REQUEST_URL));

  if (!response.ok) {
    throw new Error(
      `Unable to generate OpenAPI spec from ${DOCS_JSON_PATH} (${response.status}).`,
    );
  }

  const spec = (await response.json()) as Record<string, unknown>;
  return normalizeTrailingNewline(stringify(spec));
};

export const syncOpenApiDoc = async (
  outputPath: string = DEFAULT_OUTPUT_PATH,
  check = false,
): Promise<boolean> => {
  const nextContents = await generateOpenApiYaml();
  let currentContents: string | null = null;

  try {
    currentContents = await readFile(outputPath, "utf8");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  if (currentContents === nextContents) {
    return true;
  }

  if (check) {
    return false;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, nextContents, "utf8");
  return true;
};

const main = async () => {
  const check = process.argv.includes("--check");
  const isUpToDate = await syncOpenApiDoc(DEFAULT_OUTPUT_PATH, check);

  if (!isUpToDate) {
    console.error("docs/openapi.yaml is out of date.");
    process.exitCode = 1;
    return;
  }

  console.log(
    check ? "docs/openapi.yaml is up to date." : "Updated docs/openapi.yaml.",
  );
};

if (import.meta.main) {
  await main();
}
