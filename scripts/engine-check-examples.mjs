#!/usr/bin/env node
// Walks every directory under `examples/` that contains a `project.json` and
// runs `engine check` against it. Used as the first step of `npm run
// preflight` so a schema regression in any sample project is caught before
// typecheck / vitest / build / e2e.
//
// Skips `examples/backends/` because those are server skeletons, not AGF
// projects.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const examplesDir = resolve(repoRoot, "examples");
// Resolve the local tsx binary directly instead of going through `npx`, which
// in CI re-installs tsx into its npx cache and that copy fails to resolve
// `ajv` from the repo's `node_modules/`.
const tsxBin = resolve(
  repoRoot,
  "node_modules",
  ".bin",
  platform() === "win32" ? "tsx.cmd" : "tsx"
);

const candidates = readdirSync(examplesDir)
  .map((name) => ({ name, path: resolve(examplesDir, name) }))
  .filter((entry) => statSync(entry.path).isDirectory())
  .filter((entry) => entry.name !== "backends")
  .filter((entry) => existsSync(resolve(entry.path, "project.json")));

if (candidates.length === 0) {
  console.error("[engine:check:examples] no example projects with project.json found.");
  process.exit(1);
}

let failed = 0;
for (const entry of candidates) {
  console.log(`\n[engine:check:examples] ${entry.name}`);
  const result = spawnSync(
    tsxBin,
    ["engine/tools/cli.ts", "check", `examples/${entry.name}`],
    { stdio: "inherit", cwd: repoRoot }
  );
  if (result.status !== 0) {
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n[engine:check:examples] ${failed} project(s) failed validation.`);
  process.exit(1);
}
console.log(`\n[engine:check:examples] ${candidates.length} project(s) OK.`);
