import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import * as dbModule from "../src/lib/db";
import { schema } from "../src/lib/db";
import { getTableConfig } from "drizzle-orm/pg-core";

const DEFAULT_OUTPUT_PATH = path.join(
  import.meta.dir,
  "..",
  "docs",
  "database-schema.md",
);

type ColumnDoc = {
  name: string;
  type: string;
  nullable: boolean;
  keyConstraint: string;
  notes: string;
};

type IndexDoc = {
  table: string;
  name: string;
  unique: boolean;
  columns: string[];
  where?: string;
};

type ForeignKeyDoc = {
  table: string;
  name: string;
  columnsFrom: string[];
  tableTo: string;
  columnsTo: string[];
};

type SymbolNamedTable = {
  [key: symbol]: unknown;
};

const enumEntries = Object.entries(dbModule)
  .filter(([key, value]) => key.endsWith("Enum") && value && typeof value === "function")
  .map(([, value]) => value as { enumName: string; enumValues: string[] })
  .sort((left, right) => left.enumName.localeCompare(right.enumName));

const sqlChunkToString = (chunk: unknown): string => {
  if (!chunk || typeof chunk !== "object") {
    return "";
  }

  if ("value" in chunk && Array.isArray((chunk as { value: unknown[] }).value)) {
    return (chunk as { value: unknown[] }).value.join("");
  }

  if ("name" in chunk && typeof (chunk as { name: unknown }).name === "string") {
    const columnChunk = chunk as {
      name: string;
      table?: SymbolNamedTable;
    };
    const tableName = columnChunk.table?.[Symbol.for("drizzle:Name")];
    return tableName
      ? `"${String(tableName)}"."${columnChunk.name}"`
      : `"${columnChunk.name}"`;
  }

  return "";
};

const sqlExpressionToString = (value: unknown): string => {
  if (!value || typeof value !== "object") {
    return value === undefined ? "" : String(value);
  }

  if ("queryChunks" in value && Array.isArray((value as { queryChunks: unknown[] }).queryChunks)) {
    return (value as { queryChunks: unknown[] }).queryChunks
      .map(sqlChunkToString)
      .join("")
      .trim();
  }

  return String(value);
};

const escapeCell = (value: string): string => value.replace(/\|/g, "\\|");

const renderMarkdownTable = (headers: string[], rows: string[][]): string => {
  const headerRow = `| ${headers.join(" | ")} |`;
  const dividerRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyRows = rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`);

  return [headerRow, dividerRow, ...bodyRows].join("\n");
};

const symbolTableName = (table: unknown): string | null => {
  if (!table || typeof table !== "object") {
    return null;
  }

  const tableName = (table as SymbolNamedTable)[Symbol.for("drizzle:Name")];
  return typeof tableName === "string" ? tableName : null;
};

const getForeignKeyDocs = (): ForeignKeyDoc[] =>
  Object.values(schema)
    .flatMap((table) => {
      const config = getTableConfig(table);
      return config.foreignKeys.map((foreignKey) => {
        const reference = foreignKey.reference();
        return {
          table: config.name,
          name: foreignKey.getName(),
          columnsFrom: reference.columns.map((column) => column.name),
          tableTo: symbolTableName(reference.foreignTable) ?? "unknown_table",
          columnsTo: reference.foreignColumns.map((column) => column.name),
        };
      });
    })
    .sort((left, right) =>
      `${left.table}:${left.name}`.localeCompare(`${right.table}:${right.name}`),
    );

const getIndexDocs = (): IndexDoc[] =>
  Object.values(schema)
    .flatMap((table) => {
      const config = getTableConfig(table);
      return config.indexes.map((index) => ({
        table: config.name,
        name: index.config.name ?? `${config.name}_unnamed_index`,
        unique: index.config.unique,
        columns: index.config.columns.map((column) =>
          typeof column === "object" && column && "name" in column
            ? String((column as { name: string }).name)
            : String(column),
        ),
        where: index.config.where
          ? sqlExpressionToString(index.config.where)
          : undefined,
      }));
    })
    .sort((left, right) =>
      `${left.table}:${left.name}`.localeCompare(`${right.table}:${right.name}`),
    );

const getColumnDocs = (tableName: string): ColumnDoc[] => {
  const table = Object.values(schema).find(
    (candidate) => getTableConfig(candidate).name === tableName,
  );

  if (!table) {
    return [];
  }

  const config = getTableConfig(table);
  const foreignKeys = config.foreignKeys.map((foreignKey) => foreignKey.reference());

  return config.columns.map((column) => {
    const defaultValue = sqlExpressionToString(column.default);
    const foreignKey = foreignKeys.find((reference) =>
      reference.columns.some((referenceColumn) => referenceColumn.name === column.name),
    );
    const keyParts = [
      column.primary ? "PK" : "",
      foreignKey ? `FK -> ${referenceTableName(foreignKey.foreignTable)}.${foreignKey.foreignColumns.map((fkColumn) => fkColumn.name).join(", ")}` : "",
    ].filter(Boolean);
    const notes = [defaultValue ? `default ${defaultValue}` : ""].filter(Boolean);

    return {
      name: column.name,
      type: column.getSQLType(),
      nullable: !column.notNull,
      keyConstraint: keyParts.join("; "),
      notes: notes.join("; "),
    };
  });
};

const referenceTableName = (table: unknown): string =>
  symbolTableName(table) ?? "unknown_table";

const mermaidCardinality = (foreignKey: ForeignKeyDoc): string => {
  const fromTable = Object.values(schema).find(
    (candidate) => getTableConfig(candidate).name === foreignKey.table,
  );
  const toTable = Object.values(schema).find(
    (candidate) => getTableConfig(candidate).name === foreignKey.tableTo,
  );

  if (!fromTable || !toTable) {
    return "||--o{";
  }

  const fromConfig = getTableConfig(fromTable);
  const toConfig = getTableConfig(toTable);
  const fromPrimary = foreignKey.columnsFrom.every((columnName) =>
    fromConfig.columns.some((column) => column.name === columnName && column.primary),
  );
  const toPrimary = foreignKey.columnsTo.every((columnName) =>
    toConfig.columns.some((column) => column.name === columnName && column.primary),
  );

  if (fromPrimary && toPrimary) {
    return "||--||";
  }

  return "||--o{";
};

const mermaidRelationshipLine = (foreignKey: ForeignKeyDoc): string =>
  `  ${foreignKey.tableTo} ${mermaidCardinality(foreignKey)} ${foreignKey.table} : "${foreignKey.columnsFrom.join(", ")}"`;

export const generateDatabaseSchemaMarkdown = (): string => {
  const foreignKeys = getForeignKeyDocs();
  const indexes = getIndexDocs();
  const tableNames = Object.values(schema)
    .map((table) => getTableConfig(table).name)
    .sort((left, right) => left.localeCompare(right));

  const sections: string[] = [
    "# Database Schema",
    "",
    "Generated from `src/lib/db.ts`. Do not edit this file by hand; run `bun run docs:db-schema` after schema changes.",
    "",
    "## Tables",
  ];

  for (const tableName of tableNames) {
    sections.push("");
    sections.push(`### \`${tableName}\``);
    sections.push("");
    sections.push(
      renderMarkdownTable(
        ["Column", "Type", "Nullable", "Key / Constraint", "Notes"],
        getColumnDocs(tableName).map((column) => [
          `\`${column.name}\``,
          `\`${column.type}\``,
          column.nullable ? "Yes" : "No",
          column.keyConstraint || "",
          column.notes || "",
        ]),
      ),
    );
  }

  sections.push("");
  sections.push("## Indexes");
  sections.push("");
  sections.push(
    renderMarkdownTable(
      ["Table", "Index", "Unique", "Columns", "Predicate"],
      indexes.map((index) => [
        `\`${index.table}\``,
        `\`${index.name}\``,
        index.unique ? "Yes" : "No",
        index.columns.map((column) => `\`${column}\``).join(", "),
        index.where ? `\`${index.where}\`` : "",
      ]),
    ),
  );

  sections.push("");
  sections.push("## Foreign Keys");
  sections.push("");
  sections.push(
    renderMarkdownTable(
      ["From Table", "Columns", "To Table", "Columns", "Constraint"],
      foreignKeys.map((foreignKey) => [
        `\`${foreignKey.table}\``,
        foreignKey.columnsFrom.map((column) => `\`${column}\``).join(", "),
        `\`${foreignKey.tableTo}\``,
        foreignKey.columnsTo.map((column) => `\`${column}\``).join(", "),
        `\`${foreignKey.name}\``,
      ]),
    ),
  );

  sections.push("");
  sections.push("## Enums");
  sections.push("");
  sections.push(
    renderMarkdownTable(
      ["Enum", "Values"],
      enumEntries.map((entry) => [
        `\`${entry.enumName}\``,
        entry.enumValues.map((value) => `\`${value}\``).join(", "),
      ]),
    ),
  );

  sections.push("");
  sections.push("## Relationships");
  sections.push("");
  sections.push("```mermaid");
  sections.push("erDiagram");

  for (const foreignKey of foreignKeys) {
    sections.push(mermaidRelationshipLine(foreignKey));
  }

  sections.push("```");
  sections.push("");
  sections.push("## Notes");
  sections.push("");
  sections.push(
    "- `agent_publications.namespace` is a logical link to `namespaces.namespace`, but it is intentionally not enforced as a foreign key so pending pre-verification publications can exist before a namespace claim is finalized.",
  );

  return `${sections.join("\n")}\n`;
};

export const syncDatabaseSchemaDoc = async (
  outputPath = DEFAULT_OUTPUT_PATH,
  check = false,
): Promise<boolean> => {
  const content = generateDatabaseSchemaMarkdown();
  const normalizedOutputPath = path.resolve(outputPath);

  if (check) {
    try {
      const existing = await readFile(normalizedOutputPath, "utf8");
      return existing === content;
    } catch {
      return false;
    }
  }

  await mkdir(path.dirname(normalizedOutputPath), { recursive: true });
  await writeFile(normalizedOutputPath, content, "utf8");
  return true;
};

const main = async () => {
  const args = new Set(process.argv.slice(2));
  const check = args.has("--check");
  const ok = await syncDatabaseSchemaDoc(DEFAULT_OUTPUT_PATH, check);

  if (check) {
    if (!ok) {
      console.error(
        "docs/database-schema.md is stale. Run `bun run docs:db-schema`.",
      );
      process.exitCode = 1;
      return;
    }

    console.log("docs/database-schema.md is up to date.");
    return;
  }

  console.log("Updated docs/database-schema.md");
};

if (import.meta.main) {
  await main();
}
