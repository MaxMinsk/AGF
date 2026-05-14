// S45 AGENT-cli-list-components.
//
// Lists every component an agent can author in a project. Sources:
//   1. Built-in components declared on `scene.schema.json` under
//      `definitions.entity.properties.components.properties`.
//   2. Project-local components declared in
//      `<projectDir>/project-local-components.schema.json` if present.
//
// Pure data — emits a stable shape so callers can read JSON or render text.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

export type ComponentEntry = {
  name: string;
  source: "engine" | "project";
  description: string | undefined;
  /** `$ref` target inside the schema, e.g. `#/definitions/transformComponent`. */
  ref: string | undefined;
};

export type ComponentCatalog = {
  engine: ComponentEntry[];
  project: ComponentEntry[];
};

type SceneSchema = {
  definitions?: Record<string, SchemaNode>;
};

type SchemaNode = {
  description?: string;
  properties?: Record<string, SchemaNode>;
  $ref?: string;
};

function readSceneSchema(): SceneSchema {
  const schemaPath = resolve(repoRoot, "schemas/scene.schema.json");
  return JSON.parse(readFileSync(schemaPath, "utf8")) as SceneSchema;
}

function resolveRef(schema: SceneSchema, ref: string): SchemaNode | undefined {
  if (!ref.startsWith("#/definitions/")) return undefined;
  const key = ref.slice("#/definitions/".length);
  return schema.definitions?.[key];
}

export function listComponentCatalog(projectDir?: string): ComponentCatalog {
  const schema = readSceneSchema();
  const componentsNode =
    schema.definitions?.["entity"]?.properties?.["components"];
  const entries = componentsNode?.properties ?? {};
  const engine: ComponentEntry[] = [];
  for (const [name, node] of Object.entries(entries)) {
    const ref = node.$ref;
    const target = ref !== undefined ? resolveRef(schema, ref) : undefined;
    engine.push({
      name,
      source: "engine",
      description: target?.description ?? node.description,
      ref
    });
  }
  engine.sort((a, b) => a.name.localeCompare(b.name));

  const project: ComponentEntry[] = [];
  if (projectDir !== undefined) {
    const projectSchemaPath = resolve(
      projectDir,
      "project-local-components.schema.json"
    );
    if (existsSync(projectSchemaPath)) {
      const projectSchema = JSON.parse(
        readFileSync(projectSchemaPath, "utf8")
      ) as { properties?: Record<string, SchemaNode> };
      for (const [name, node] of Object.entries(projectSchema.properties ?? {})) {
        project.push({
          name,
          source: "project",
          description: node.description,
          ref: undefined
        });
      }
      project.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return { engine, project };
}

export function formatComponentCatalog(catalog: ComponentCatalog): string {
  const lines: string[] = [];
  lines.push(`Built-in components (${catalog.engine.length}):`);
  if (catalog.engine.length === 0) {
    lines.push("  (none)");
  } else {
    const widest = Math.max(...catalog.engine.map((e) => e.name.length));
    for (const entry of catalog.engine) {
      const pad = entry.name.padEnd(widest);
      const desc = entry.description ?? "";
      lines.push(`  ${pad}  ${desc}`);
    }
  }
  lines.push("");
  if (catalog.project.length > 0) {
    lines.push(`Project-local components (${catalog.project.length}):`);
    const widest = Math.max(...catalog.project.map((e) => e.name.length));
    for (const entry of catalog.project) {
      const pad = entry.name.padEnd(widest);
      const desc = entry.description ?? "";
      lines.push(`  ${pad}  ${desc}`);
    }
  } else {
    lines.push(
      "Project-local components: (none — add `project-local-components.schema.json` to declare extras)"
    );
  }
  return lines.join("\n");
}
