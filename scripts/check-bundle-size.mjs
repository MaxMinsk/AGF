#!/usr/bin/env node
// Asserts that the production build's main bundle stays under a budget.
// Run after `vite build` (or as part of preflight) so creeping dependencies
// are caught at the same step the build runs.
//
// Budget targets the gzipped size of the largest JS asset under dist/assets.
// We track gzip because that is what the browser actually downloads.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = resolve(repoRoot, "dist/assets");

// Budget rationale (2026-05-13): main bundle is ~191 KB gzipped after Sprint
// 24; mostly Three.js + AJV + engine runtime. Set the budget 25% above the
// current value so routine code adds do not flap, but a sudden 100 KB
// dependency stands out.
const MAIN_BUNDLE_GZIP_BUDGET_BYTES = 250 * 1024;

let mainBundleBytes = 0;
let mainBundleName = "(none)";

if (!statSync(assetsDir).isDirectory()) {
  console.error(`[bundle-size] ${assetsDir} not found — run \`npm run build\` first.`);
  process.exit(1);
}

for (const name of readdirSync(assetsDir)) {
  if (!name.endsWith(".js")) {
    continue;
  }
  const full = resolve(assetsDir, name);
  const bytes = readFileSync(full);
  const gzipped = gzipSync(bytes).length;
  if (gzipped > mainBundleBytes) {
    mainBundleBytes = gzipped;
    mainBundleName = name;
  }
}

const limitKb = MAIN_BUNDLE_GZIP_BUDGET_BYTES / 1024;
const actualKb = mainBundleBytes / 1024;
const formatted = `${actualKb.toFixed(1)} kB gzipped (budget ${limitKb.toFixed(0)} kB)`;

if (mainBundleBytes > MAIN_BUNDLE_GZIP_BUDGET_BYTES) {
  console.error(
    `[bundle-size] FAIL — largest JS chunk \`${mainBundleName}\` is ${formatted}`
  );
  console.error("[bundle-size] If this is expected, raise MAIN_BUNDLE_GZIP_BUDGET_BYTES in scripts/check-bundle-size.mjs.");
  process.exit(1);
}

console.log(`[bundle-size] OK — \`${mainBundleName}\` is ${formatted}`);
