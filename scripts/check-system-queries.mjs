#!/usr/bin/env node
// SYS-rule-createquery: enforce that frame/fixed-update System callbacks
// never call `world.query(...)` directly in their hot path. Systems must
// cache a QueryHandle via `world.createQuery(...)` (memoised against the
// structural revision) and call `.run()` per frame instead.
//
// Why: `world.query(...)` is O(N) every call and allocates a new array.
// Cached `createQuery(...)` is ~18,000× faster on a steady-state scene
// at 10k entities. See docs/research/ecs-benchmarks-baseline.json.
//
// Scope: anything under `engine/**/systems/**.ts` or
// `examples/**/src/systems/**.ts`. The check is regex-based so it has
// false-positive potential — if a system has a one-off `world.query()`
// in a non-hot helper, mark the line with `// agf-allow: world.query`
// to opt out.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");

const SCOPES = [
  resolve(REPO_ROOT, "engine/render/systems"),
  resolve(REPO_ROOT, "engine/core/systems"),
  resolve(REPO_ROOT, "examples")
];

const ALLOW = /\/\/\s*agf-allow:\s*world\.query/;
const QUERY = /\bworld\.query\s*\(/;

/** @param {string} dir */
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      // For examples/, only descend into */src/systems/
      const fromRoot = relative(REPO_ROOT, full).replaceAll("\\", "/");
      if (fromRoot.startsWith("examples/")) {
        if (
          fromRoot === "examples" ||
          /^examples\/[^/]+$/.test(fromRoot) ||
          /^examples\/[^/]+\/src$/.test(fromRoot) ||
          /^examples\/[^/]+\/src\/systems(\/.*)?$/.test(fromRoot)
        ) {
          yield* walk(full);
        }
        continue;
      }
      yield* walk(full);
    } else if (entry.endsWith(".ts")) {
      yield full;
    }
  }
}

const violations = [];

for (const scope of SCOPES) {
  for (const file of walk(scope)) {
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (!QUERY.test(line)) return;
      if (ALLOW.test(line) || ALLOW.test(lines[i - 1] ?? "")) return;
      // Strip the call inside a comment.
      const codeOnly = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      if (!QUERY.test(codeOnly)) return;
      violations.push({
        file: relative(REPO_ROOT, file),
        line: i + 1,
        snippet: line.trim()
      });
    });
  }
}

if (violations.length === 0) {
  console.log("system-queries: ok (no world.query() in System hot paths)");
  process.exit(0);
}

console.error("system-queries: violations found — cache via world.createQuery()");
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.snippet}`);
}
console.error("\nFix: const q = world.createQuery([...]) outside frameUpdate; call q.run() inside.");
console.error("Override (rare): add `// agf-allow: world.query` on the same or previous line.");
process.exit(1);
