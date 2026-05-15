// Schema bundler. Reads `schemas/scene.schema.json` (the entry point,
// kept small after the S48 domain split) + every external `$ref` it
// points at (`common.schema.json`, `components/*.schema.json`) and
// inlines all referenced definitions back into a single in-memory
// schema that AJV can compile in one pass.
//
// Why bundle instead of using AJV's multi-schema refs:
//   * AJV's `addSchema` requires `$id` URIs to match the ref base
//     exactly + every consumer must register every domain file in the
//     same order. Easy to forget; hard to debug.
//   * Bundling is purely functional — read N files, copy definitions,
//     rewrite refs to `#/definitions/X`. AJV sees a single schema and
//     the existing call sites (project-check, the per-component schema
//     tests, list-components, explain-component) all stay simple.
//
// The returned schema is structurally identical to the pre-S48
// single-file scene.schema.json plus the bundler keeps the original
// component-definition names so existing test fixtures + diagnostics
// don't shift.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const schemasDir = resolve(repoRoot, "schemas");

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [k: string]: JsonValue };

type SchemaObject = { [k: string]: JsonValue };

let bundledCache: SchemaObject | undefined;

/**
 * Returns the bundled scene schema with every external `$ref` rewritten
 * to a local `#/definitions/...` ref and every referenced definition
 * inlined under `definitions`. Cached after the first call — schemas
 * never change at runtime.
 */
export function loadBundledSceneSchema(): SchemaObject {
  if (bundledCache !== undefined) return bundledCache;

  const scene = readJson(resolve(schemasDir, "scene.schema.json"));
  const merged: SchemaObject = JSON.parse(JSON.stringify(scene));
  if (typeof merged !== "object" || merged === null || Array.isArray(merged)) {
    throw new Error("scene.schema.json must be a JSON object at the root");
  }

  if (
    merged["definitions"] === undefined ||
    typeof merged["definitions"] !== "object" ||
    Array.isArray(merged["definitions"])
  ) {
    merged["definitions"] = {};
  }
  const mergedDefs = merged["definitions"] as SchemaObject;

  const fileCache = new Map<string, SchemaObject>();
  const inlined = new Set<string>(Object.keys(mergedDefs));

  const readFile = (relativePath: string): SchemaObject => {
    const cached = fileCache.get(relativePath);
    if (cached !== undefined) return cached;
    const data = readJson(resolve(schemasDir, relativePath));
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error(`Schema ${relativePath} must be a JSON object`);
    }
    fileCache.set(relativePath, data);
    return data;
  };

  // Walk the merged schema rewriting refs. When an external ref points
  // at `<file>#/definitions/<name>`, copy that definition into
  // `merged.definitions[name]` and rewrite the ref to internal form.
  const rewrite = (value: JsonValue): JsonValue => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value !== null && typeof value === "object") {
      const out: SchemaObject = {};
      for (const [key, raw] of Object.entries(value)) {
        if (key === "$ref" && typeof raw === "string" && raw.includes("#/definitions/")) {
          const hashIdx = raw.indexOf("#/definitions/");
          const filePart = raw.slice(0, hashIdx);
          const defName = raw.slice(hashIdx + "#/definitions/".length);
          if (filePart === "") {
            // already inline
            out[key] = raw;
            continue;
          }
          if (!inlined.has(defName)) {
            inlined.add(defName);
            const sourceFile = readFile(filePart);
            const sourceDefs = sourceFile["definitions"];
            if (
              sourceDefs === undefined ||
              typeof sourceDefs !== "object" ||
              Array.isArray(sourceDefs)
            ) {
              throw new Error(`Schema ${filePart} has no definitions`);
            }
            const defValue = (sourceDefs as SchemaObject)[defName];
            if (defValue === undefined) {
              throw new Error(`Schema ${filePart} missing definitions/${defName}`);
            }
            mergedDefs[defName] = rewrite(defValue);
          }
          out[key] = `#/definitions/${defName}`;
          continue;
        }
        out[key] = rewrite(raw);
      }
      return out;
    }
    return value;
  };

  const rewritten = rewrite(merged) as SchemaObject;
  // `rewrite` may have appended new entries to `mergedDefs` (the original
  // `merged.definitions` reference) while walking the tree. The
  // returned `rewritten` object has its own freshly-rewritten copy of
  // `definitions` that's missing any defs added mid-walk. Patch the
  // returned schema's definitions to include both the rewritten original
  // entries AND the new ones the walker pulled in from external files.
  const finalDefs = (rewritten["definitions"] ?? {}) as SchemaObject;
  for (const [name, value] of Object.entries(mergedDefs)) {
    if (!(name in finalDefs)) finalDefs[name] = value;
  }
  rewritten["definitions"] = finalDefs;
  bundledCache = rewritten;
  return rewritten;
}

function readJson(path: string): JsonValue {
  return JSON.parse(readFileSync(path, "utf8")) as JsonValue;
}
