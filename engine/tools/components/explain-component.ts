// S45 AGENT-cli-explain-component.
//
// Prints a compact spec for one component: required fields, optional
// fields with types + descriptions, and a derived authoring example.
// Reads from `schemas/scene.schema.json` (engine components) or
// `<projectDir>/project-local-components.schema.json` (project-local).

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

export type ComponentExplanation = {
  name: string;
  source: "engine" | "project";
  description: string | undefined;
  required: string[];
  properties: Array<{
    name: string;
    type: string;
    description: string | undefined;
    optional: boolean;
  }>;
  example: Record<string, unknown>;
};

type SchemaNode = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  items?: SchemaNode;
  minItems?: number;
  maxItems?: number;
  enum?: unknown[];
  $ref?: string;
};

type SceneSchema = {
  definitions?: Record<string, SchemaNode>;
};

function readSceneSchema(): SceneSchema {
  const schemaPath = resolve(repoRoot, "schemas/scene.schema.json");
  return JSON.parse(readFileSync(schemaPath, "utf8")) as SceneSchema;
}

function resolveRef(schema: SceneSchema, ref: string): SchemaNode | undefined {
  if (!ref.startsWith("#/definitions/")) return undefined;
  return schema.definitions?.[ref.slice("#/definitions/".length)];
}

function describeType(node: SchemaNode): string {
  if (node.$ref !== undefined) return `$ref ${node.$ref}`;
  if (Array.isArray(node.type)) return node.type.join(" | ");
  if (node.type === "array") {
    const itemType = node.items !== undefined ? describeType(node.items) : "unknown";
    const range =
      node.minItems !== undefined && node.maxItems === node.minItems
        ? ` (length ${node.minItems})`
        : "";
    return `array<${itemType}>${range}`;
  }
  if (node.enum !== undefined) {
    return `enum (${node.enum.map((v) => JSON.stringify(v)).join(" | ")})`;
  }
  return node.type ?? "unknown";
}

function exampleValue(schema: SceneSchema, node: SchemaNode): unknown {
  if (node.$ref !== undefined) {
    const target = resolveRef(schema, node.$ref);
    if (target !== undefined) return exampleValue(schema, target);
    return null;
  }
  if (node.enum !== undefined && node.enum.length > 0) return node.enum[0];
  if (Array.isArray(node.type)) return null;
  switch (node.type) {
    case "string":
      return "";
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array": {
      const length = node.minItems ?? 0;
      const itemType = node.items;
      const out: unknown[] = [];
      for (let i = 0; i < length; i += 1) {
        out.push(itemType !== undefined ? exampleValue(schema, itemType) : null);
      }
      return out;
    }
    case "object": {
      const fields: Record<string, unknown> = {};
      const required = new Set(node.required ?? []);
      for (const [key, child] of Object.entries(node.properties ?? {})) {
        if (required.has(key)) fields[key] = exampleValue(schema, child);
      }
      return fields;
    }
    default:
      return null;
  }
}

function explainNode(
  schema: SceneSchema,
  name: string,
  source: "engine" | "project",
  node: SchemaNode
): ComponentExplanation {
  const properties: ComponentExplanation["properties"] = [];
  const required = new Set(node.required ?? []);
  for (const [propName, propNode] of Object.entries(node.properties ?? {})) {
    properties.push({
      name: propName,
      type: describeType(propNode),
      description: propNode.description,
      optional: !required.has(propName)
    });
  }
  properties.sort((a, b) => {
    if (a.optional !== b.optional) return a.optional ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  return {
    name,
    source,
    description: node.description,
    required: node.required ?? [],
    properties,
    example: exampleValue(schema, node) as Record<string, unknown>
  };
}

export function explainComponent(
  name: string,
  projectDir?: string
): ComponentExplanation | undefined {
  const schema = readSceneSchema();
  const components =
    schema.definitions?.["entity"]?.properties?.["components"]?.properties ?? {};
  const engineRef = components[name]?.$ref;
  if (engineRef !== undefined) {
    const node = resolveRef(schema, engineRef);
    if (node !== undefined) return explainNode(schema, name, "engine", node);
  }
  if (projectDir !== undefined) {
    const projectSchemaPath = resolve(
      projectDir,
      "project-local-components.schema.json"
    );
    if (existsSync(projectSchemaPath)) {
      const projectSchema = JSON.parse(
        readFileSync(projectSchemaPath, "utf8")
      ) as { properties?: Record<string, SchemaNode> };
      const node = projectSchema.properties?.[name];
      if (node !== undefined)
        return explainNode(schema, name, "project", node);
    }
  }
  return undefined;
}

export function formatComponentExplanation(explanation: ComponentExplanation): string {
  const lines: string[] = [];
  lines.push(`${explanation.name} (${explanation.source})`);
  if (explanation.description !== undefined) {
    lines.push(`  ${explanation.description}`);
  }
  if (explanation.required.length > 0) {
    lines.push(`  required: ${explanation.required.join(", ")}`);
  }
  lines.push("");
  lines.push("Fields:");
  if (explanation.properties.length === 0) {
    lines.push("  (none)");
  } else {
    const widestName = Math.max(...explanation.properties.map((p) => p.name.length));
    const widestType = Math.max(...explanation.properties.map((p) => p.type.length));
    for (const prop of explanation.properties) {
      const tag = prop.optional ? "  " : "* ";
      const padName = prop.name.padEnd(widestName);
      const padType = prop.type.padEnd(widestType);
      const desc = prop.description ?? "";
      lines.push(`  ${tag}${padName}  ${padType}  ${desc}`);
    }
    lines.push("  (`*` = required)");
  }
  lines.push("");
  lines.push("Authoring example:");
  lines.push(`  ${JSON.stringify({ [explanation.name]: explanation.example }, null, 2).replace(/\n/g, "\n  ")}`);
  return lines.join("\n");
}
