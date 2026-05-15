// S45 AGENT-cli-list-components.
//
// Lists every component an agent can author in a project. Sources:
//   1. Built-in components declared in the bundled scene schema under
//      `definitions.entity.properties.components.properties`. The S48
//      split keeps `scene.schema.json` as a tiny index — the bundler
//      inlines every domain file's definitions so a single resolver
//      handles all engine components.
//   2. Project-local components declared in
//      `<projectDir>/schemas/scene-extensions.schema.json` if present.
//
// Pure data — emits a stable shape so callers can read JSON or render text.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadBundledSceneSchema } from "../schemas/load-scene-schema";

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
  return loadBundledSceneSchema() as unknown as SceneSchema;
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
    // Project-local extensions live in `<projectDir>/schemas/scene-extensions.schema.json`
    // — the same path that `engine check`'s mergeSceneExtensions reads. The
    // format is top-level `components: { Name: { $ref: "#/definitions/..." } }`
    // plus `definitions: { ... }`. We resolve the $ref to fetch descriptions
    // so the catalog matches what an author sees in the schema.
    const projectSchemaPath = resolve(
      projectDir,
      "schemas/scene-extensions.schema.json"
    );
    if (existsSync(projectSchemaPath)) {
      const projectSchema = JSON.parse(
        readFileSync(projectSchemaPath, "utf8")
      ) as { components?: Record<string, SchemaNode>; definitions?: Record<string, SchemaNode> };
      const projectComponents = projectSchema.components ?? {};
      for (const [name, node] of Object.entries(projectComponents)) {
        const ref = node.$ref;
        const target =
          ref !== undefined && ref.startsWith("#/definitions/")
            ? projectSchema.definitions?.[ref.slice("#/definitions/".length)]
            : undefined;
        project.push({
          name,
          source: "project",
          description: target?.description ?? node.description,
          ref
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
