#!/usr/bin/env node
// M21-boundary-check: enforce the renderer-import-boundary documented in
// docs/ARCHITECTURE.md.
//
// engine/core/ must never import:
//   - three (the Three.js npm package or any subpath)
//   - engine/render/ (the renderer package)
//
// engine/render/ may import engine/core/ but never vice versa. This script
// is a guardrail for that invariant — runs in preflight and CI.
//
// Why a separate script instead of folding into `engine check`?
//   `engine check` validates *project files* (scenes / prefabs / materials).
//   This validates *engine source code*. Different concerns, different
//   subjects; keep them in different tools.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");

const RULES = [
  {
    scope: "engine/core",
    forbiddenPackages: [/^three(\/.*)?$/],
    forbiddenRelativePathPrefix: "engine/render"
  }
];

/** @param {string} dir */
function* walkTs(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      yield* walkTs(fullPath);
    } else if (entry.endsWith(".ts")) {
      yield fullPath;
    }
  }
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;

/** @param {string} src */
function importsOf(src) {
  const result = [];
  let match;
  while ((match = IMPORT_RE.exec(src)) !== null) {
    result.push(match[1]);
  }
  return result;
}

const violations = [];

for (const rule of RULES) {
  const scopeRoot = resolve(REPO_ROOT, rule.scope);
  for (const file of walkTs(scopeRoot)) {
    const src = readFileSync(file, "utf8");
    for (const spec of importsOf(src)) {
      if (rule.forbiddenPackages.some((re) => re.test(spec))) {
        violations.push({
          file: relative(REPO_ROOT, file),
          reason: `imports forbidden package "${spec}" (rule: ${rule.scope} → no three)`
        });
        continue;
      }
      if (spec.startsWith(".")) {
        const resolved = resolve(dirname(file), spec);
        const fromRoot = relative(REPO_ROOT, resolved).replaceAll("\\", "/");
        if (fromRoot.startsWith(`${rule.forbiddenRelativePathPrefix}/`)) {
          violations.push({
            file: relative(REPO_ROOT, file),
            reason: `imports "${spec}" → ${fromRoot} (rule: ${rule.scope} → no ${rule.forbiddenRelativePathPrefix})`
          });
        }
      }
    }
  }
}

if (violations.length === 0) {
  console.log("import-boundaries: ok (no engine/core → render or core → three imports)");
  process.exit(0);
}

console.error("import-boundaries: violations found");
for (const v of violations) {
  console.error(`  ${v.file}: ${v.reason}`);
}
process.exit(1);
