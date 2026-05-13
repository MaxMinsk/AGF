// Project-file patch contract v0.
//
// A patch is an ordered list of operations against project files. Each
// operation targets a file path (relative to the project root) and a JSON
// pointer inside that file. Operations:
//
//   - `set`: writes `value` at `path`, replacing any existing value.
//   - `delete`: removes the value at `path`.
//   - `insert`: inserts `value` into the array at `path` (or appends if
//     `index` is omitted or out of range).
//
// `engine patch --check` runs the full pipeline in memory and reports
// diagnostics + the resulting file contents without touching disk.
// `engine patch --write` applies the operations and writes the result.
//
// Goal: agents emit reviewable JSON patches that the engine can validate
// before mutating the repo. Replaces the "edit-then-hope" loop with a
// schema-checked, replayable artifact.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type PatchOp =
  | { kind: "set"; file: string; path: string; value: unknown }
  | { kind: "delete"; file: string; path: string }
  | { kind: "insert"; file: string; path: string; value: unknown; index?: number };

export type EnginePatch = {
  agfFormatVersion?: number;
  description?: string;
  operations: PatchOp[];
};

export type PatchDiagnostic = {
  severity: "error" | "warning";
  opIndex: number;
  message: string;
};

export type PatchResult = {
  projectDir: string;
  diagnostics: PatchDiagnostic[];
  /** Per-file resulting JSON (after all ops). Only populated on success. */
  files: Record<string, unknown>;
  /** True iff no `error`-severity diagnostics. */
  ok: boolean;
};

export type ApplyPatchOptions = {
  /** When true (`--write`), the resulting files are written to disk. */
  write?: boolean;
};

export function applyPatch(
  projectDirInput: string,
  patch: EnginePatch,
  options: ApplyPatchOptions = {}
): PatchResult {
  const projectDir = resolve(projectDirInput);
  const diagnostics: PatchDiagnostic[] = [];
  const fileCache = new Map<string, unknown>();

  const loadFile = (relative: string): unknown => {
    if (fileCache.has(relative)) {
      return fileCache.get(relative);
    }
    const absolute = resolve(projectDir, relative);
    if (!existsSync(absolute)) {
      return undefined;
    }
    const parsed = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
    fileCache.set(relative, parsed);
    return parsed;
  };

  for (let opIndex = 0; opIndex < patch.operations.length; opIndex += 1) {
    const op = patch.operations[opIndex] as PatchOp;
    if (typeof op.file !== "string" || op.file.length === 0) {
      diagnostics.push({ severity: "error", opIndex, message: "missing or empty `file`" });
      continue;
    }
    if (typeof op.path !== "string" || !op.path.startsWith("/")) {
      diagnostics.push({
        severity: "error",
        opIndex,
        message: `path must be a JSON pointer starting with \`/\` (got ${JSON.stringify(op.path)})`
      });
      continue;
    }
    const segments = decodePointer(op.path);
    const current = loadFile(op.file);
    if (current === undefined) {
      diagnostics.push({
        severity: "error",
        opIndex,
        message: `file ${op.file} does not exist under ${projectDir}`
      });
      continue;
    }
    try {
      const next = applyOperation(current, op, segments);
      fileCache.set(op.file, next);
    } catch (error) {
      diagnostics.push({
        severity: "error",
        opIndex,
        message: (error as Error).message ?? String(error)
      });
    }
  }

  const ok = diagnostics.every((d) => d.severity !== "error");
  if (ok && options.write === true) {
    for (const [relative, data] of fileCache) {
      writeFileSync(resolve(projectDir, relative), JSON.stringify(data, null, 2) + "\n");
    }
  }

  return {
    projectDir,
    diagnostics,
    files: Object.fromEntries(fileCache),
    ok
  };
}

export function formatPatchResult(result: PatchResult): string {
  const lines: string[] = [];
  lines.push(`Patch: ${result.projectDir}`);
  lines.push(`  ok: ${result.ok}`);
  if (result.diagnostics.length > 0) {
    lines.push("  diagnostics:");
    for (const d of result.diagnostics) {
      lines.push(`    [${d.opIndex}] ${d.severity.toUpperCase()} ${d.message}`);
    }
  }
  lines.push("  touched files:");
  for (const name of Object.keys(result.files)) {
    lines.push(`    - ${name}`);
  }
  return lines.join("\n");
}

function applyOperation(root: unknown, op: PatchOp, segments: string[]): unknown {
  if (segments.length === 0 && op.kind !== "set") {
    throw new Error(`cannot ${op.kind} the root document directly`);
  }
  if (op.kind === "set" && segments.length === 0) {
    return op.value;
  }
  // `insert` semantics: the pointer addresses the *array* itself, and we
  // splice into it. `set` / `delete` address a slot inside their parent
  // container.
  if (op.kind === "insert") {
    return mutateArrayAt(root, segments, 0, op);
  }
  return mutate(root, segments, 0, op);
}

function mutateArrayAt(node: unknown, segments: string[], depth: number, op: PatchOp & { kind: "insert" }): unknown {
  const key = segments[depth];
  if (key === undefined) {
    throw new Error(`path: segment missing at depth ${depth}`);
  }
  const isLast = depth === segments.length - 1;

  if (Array.isArray(node)) {
    const index = parseArrayIndex(key, node.length, true);
    const copy = node.slice();
    if (isLast) {
      throw new Error(`insert: pointer must address an array (got an array index ${key})`);
    }
    if (index >= copy.length) {
      throw new Error(`path: array index ${key} out of range at depth ${depth}`);
    }
    copy[index] = mutateArrayAt(copy[index], segments, depth + 1, op);
    return copy;
  }

  if (node !== null && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const copy: Record<string, unknown> = { ...obj };
    if (!(key in copy)) {
      throw new Error(`path: key "${key}" not present at depth ${depth}`);
    }
    if (isLast) {
      const target = copy[key];
      if (!Array.isArray(target)) {
        throw new Error(
          `insert: target at /${segments.join("/")} is not an array (got ${target === null ? "null" : typeof target})`
        );
      }
      const next = target.slice();
      const insertAt = op.index ?? next.length;
      next.splice(Math.max(0, Math.min(insertAt, next.length)), 0, op.value);
      copy[key] = next;
      return copy;
    }
    copy[key] = mutateArrayAt(copy[key], segments, depth + 1, op);
    return copy;
  }

  throw new Error(
    `path: cannot traverse into ${node === null ? "null" : typeof node} at depth ${depth} (segment "${key}")`
  );
}

function mutate(node: unknown, segments: string[], depth: number, op: PatchOp): unknown {
  const isLast = depth === segments.length - 1;
  const key = segments[depth];
  if (key === undefined) {
    throw new Error(`path: segment missing at depth ${depth}`);
  }

  if (Array.isArray(node)) {
    const index = parseArrayIndex(key, node.length, op.kind === "insert");
    const copy = node.slice();
    if (isLast) {
      if (op.kind === "set") {
        if (index >= copy.length) {
          throw new Error(`set: index ${key} out of range for array of length ${node.length}`);
        }
        copy[index] = op.value;
      } else if (op.kind === "delete") {
        if (index >= copy.length) {
          throw new Error(`delete: index ${key} out of range for array of length ${node.length}`);
        }
        copy.splice(index, 1);
      }
      return copy;
    }
    if (index >= copy.length) {
      throw new Error(`path: array index ${key} out of range at depth ${depth}`);
    }
    copy[index] = mutate(copy[index], segments, depth + 1, op);
    return copy;
  }

  if (node !== null && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const copy: Record<string, unknown> = { ...obj };
    if (isLast) {
      if (op.kind === "set") {
        copy[key] = op.value;
      } else if (op.kind === "delete") {
        if (!(key in copy)) {
          throw new Error(`delete: key "${key}" not present`);
        }
        delete copy[key];
      }
      return copy;
    }
    if (!(key in copy)) {
      throw new Error(`path: key "${key}" not present at depth ${depth}`);
    }
    copy[key] = mutate(copy[key], segments, depth + 1, op);
    return copy;
  }

  throw new Error(
    `path: cannot traverse into ${node === null ? "null" : typeof node} at depth ${depth} (segment "${key}")`
  );
}

function parseArrayIndex(segment: string, length: number, allowAppend: boolean): number {
  if (segment === "-" && allowAppend) {
    return length;
  }
  if (!/^\d+$/.test(segment)) {
    throw new Error(`path: array index "${segment}" is not numeric`);
  }
  return Number.parseInt(segment, 10);
}

function decodePointer(pointer: string): string[] {
  if (pointer === "/") {
    return [];
  }
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}
