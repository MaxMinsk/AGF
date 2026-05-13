// `engine docs <projectDir>` v0.
//
// Generates Markdown from `schemas/*.schema.json` plus the project's
// `template_context.md` into a per-project `docs/generated/<projectId>/`
// folder. Goal: agents have a single readable index that mirrors what the
// schemas actually permit, without having to load all `.schema.json` files
// into context. Lossy-on-purpose — the schema files remain source of truth.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

export type DocsOptions = {
  projectDir: string;
  /** Repository root that holds `schemas/`. Defaults to `process.cwd()`. */
  repoRoot?: string;
  /** Output directory. Defaults to `<repoRoot>/docs/generated/<projectId>`. */
  outDir?: string;
};

export type DocsResult = {
  projectId: string;
  outDir: string;
  schemasRendered: string[];
  templateContextCopied: boolean;
  indexPath: string;
};

export function generateDocs(options: DocsOptions): DocsResult {
  const projectDir = resolve(options.projectDir);
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const projectJson = JSON.parse(readFileSync(resolve(projectDir, "project.json"), "utf8")) as {
    id: string;
    name?: string;
  };
  const outDir = resolve(options.outDir ?? resolve(repoRoot, "docs/generated", projectJson.id));
  mkdirSync(outDir, { recursive: true });

  const schemasDir = resolve(repoRoot, "schemas");
  const schemasRendered: string[] = [];
  if (existsSync(schemasDir)) {
    for (const name of readdirSync(schemasDir)) {
      if (!name.endsWith(".schema.json")) continue;
      const schemaPath = resolve(schemasDir, name);
      const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as JsonSchemaNode;
      const md = renderSchema(schema, name);
      const outName = name.replace(/\.schema\.json$/, ".md");
      writeFileSync(resolve(outDir, outName), md);
      schemasRendered.push(outName);
    }
  }

  let templateContextCopied = false;
  const templateContextPath = resolve(projectDir, "template_context.md");
  if (existsSync(templateContextPath)) {
    const body = readFileSync(templateContextPath, "utf8");
    writeFileSync(resolve(outDir, "template-context.md"), body);
    templateContextCopied = true;
  }

  const indexPath = resolve(outDir, "index.md");
  writeFileSync(indexPath, renderIndex(projectJson, schemasRendered, templateContextCopied));

  return {
    projectId: projectJson.id,
    outDir,
    schemasRendered,
    templateContextCopied,
    indexPath
  };
}

export function formatDocsResult(result: DocsResult): string {
  const lines: string[] = [];
  lines.push(`Docs: ${result.projectId}`);
  lines.push(`  out: ${result.outDir}`);
  lines.push(`  schemas: ${result.schemasRendered.length}`);
  for (const name of result.schemasRendered) {
    lines.push(`    - ${name}`);
  }
  lines.push(`  template_context: ${result.templateContextCopied ? "copied" : "(none)"}`);
  lines.push(`  index: ${result.indexPath}`);
  return lines.join("\n");
}

type JsonSchemaNode = {
  $id?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchemaNode;
  additionalProperties?: boolean | JsonSchemaNode;
  definitions?: Record<string, JsonSchemaNode>;
  $ref?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
};

function renderSchema(schema: JsonSchemaNode, sourceFile: string): string {
  const lines: string[] = [];
  const title = schema.title ?? basename(sourceFile, ".schema.json");
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`Source: \`schemas/${sourceFile}\``);
  if (schema.$id !== undefined) {
    lines.push(`$id: \`${schema.$id}\``);
  }
  if (schema.description !== undefined) {
    lines.push("");
    lines.push(schema.description);
  }
  lines.push("");
  if (schema.properties !== undefined) {
    lines.push("## Properties");
    lines.push("");
    lines.push("| Name | Type | Required | Notes |");
    lines.push("|---|---|---|---|");
    const required = new Set(schema.required ?? []);
    for (const [name, child] of Object.entries(schema.properties)) {
      const type = describeType(child);
      const notes = describeNotes(child);
      lines.push(`| \`${name}\` | ${type} | ${required.has(name) ? "yes" : "no"} | ${notes} |`);
    }
    lines.push("");
  }
  if (schema.definitions !== undefined) {
    lines.push("## Definitions");
    lines.push("");
    for (const [name, def] of Object.entries(schema.definitions)) {
      lines.push(`### ${name}`);
      lines.push("");
      lines.push(`Type: ${describeType(def)}`);
      if (def.description !== undefined) {
        lines.push("");
        lines.push(def.description);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

function describeType(node: JsonSchemaNode): string {
  if (node.$ref !== undefined) {
    return `→ ${node.$ref}`;
  }
  if (node.enum !== undefined) {
    return node.enum.map((value) => `\`${JSON.stringify(value)}\``).join(" \\| ");
  }
  if (Array.isArray(node.type)) {
    return node.type.join(" \\| ");
  }
  if (node.type === "array" && node.items !== undefined) {
    return `array<${describeType(node.items)}>`;
  }
  return node.type ?? "any";
}

function describeNotes(node: JsonSchemaNode): string {
  const notes: string[] = [];
  if (node.description !== undefined) notes.push(node.description.replace(/\n/g, " "));
  if (node.minimum !== undefined) notes.push(`min ${node.minimum}`);
  if (node.maximum !== undefined) notes.push(`max ${node.maximum}`);
  if (node.exclusiveMinimum !== undefined) notes.push(`exclusiveMin ${node.exclusiveMinimum}`);
  return notes.join("; ");
}

function renderIndex(
  project: { id: string; name?: string },
  schemas: string[],
  templateContextCopied: boolean
): string {
  const lines: string[] = [];
  lines.push(`# ${project.name ?? project.id} — generated docs`);
  lines.push("");
  lines.push(`Project id: \`${project.id}\``);
  lines.push("");
  lines.push("> Auto-generated by \`engine docs\`. Do not edit by hand; source of truth is `schemas/` and the project's `template_context.md`.");
  lines.push("");
  if (templateContextCopied) {
    lines.push("- [Template context](./template-context.md) — gameplay vocabulary and safe extension points.");
  }
  lines.push("");
  lines.push("## Schemas");
  lines.push("");
  for (const name of schemas) {
    lines.push(`- [${name.replace(/\.md$/, "")}](./${name})`);
  }
  return lines.join("\n") + "\n";
}
