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

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const examplesDir = resolve(repoRoot, "examples");
// Run tsx via `node node_modules/tsx/dist/cli.mjs` rather than through `npx`
// or the `node_modules/.bin/tsx` symlink: npx re-installs tsx into its cache
// (where it cannot resolve `ajv` from the repo's node_modules), and spawning
// the `.bin` symlink directly silently fails on some Linux CI configurations.
// Invoking node with the cli.mjs path is the most portable option.
const tsxCliPath = resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
if (!existsSync(tsxCliPath)) {
  console.error(
    `[engine:check:examples] tsx CLI not found at ${tsxCliPath}. Run \`npm ci\` first.`
  );
  process.exit(1);
}

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
    process.execPath,
    [tsxCliPath, "engine/tools/cli.ts", "check", `examples/${entry.name}`],
    { stdio: "inherit", cwd: repoRoot }
  );
  if (result.error !== undefined) {
    console.error(
      `[engine:check:examples] failed to start: ${result.error.message ?? result.error}`
    );
    failed += 1;
    continue;
  }
  if (result.status !== 0) {
    console.error(
      `[engine:check:examples] ${entry.name} exited with code ${result.status ?? "(signal)"}.`
    );
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n[engine:check:examples] ${failed} project(s) failed validation.`);
  process.exit(1);
}
console.log(`\n[engine:check:examples] ${candidates.length} project(s) OK.`);
