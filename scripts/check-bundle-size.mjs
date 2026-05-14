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
//
// Lazy-loaded vendor chunks (Rapier WASM, the auto-split Three.js chunk)
// are tracked under separate budgets so they don't blow the "main bundle"
// check. Each entry's prefix matches the Rollup chunk name; the hash
// suffix is ignored.
const MAIN_BUNDLE_GZIP_BUDGET_BYTES = 250 * 1024;
const VENDOR_BUDGETS = [
  {
    prefix: "rapier-",
    budget: 900 * 1024,
    label: "Rapier WASM (lazy-loaded behind project.physics.enabled)"
  },
  {
    prefix: "three-",
    budget: 300 * 1024,
    label: "Three.js (auto-split renderer vendor chunk)"
  }
];

if (!statSync(assetsDir).isDirectory()) {
  console.error(`[bundle-size] ${assetsDir} not found — run \`npm run build\` first.`);
  process.exit(1);
}

const chunks = [];
for (const name of readdirSync(assetsDir)) {
  if (!name.endsWith(".js")) continue;
  const full = resolve(assetsDir, name);
  const bytes = readFileSync(full);
  chunks.push({ name, bytes: gzipSync(bytes).length });
}

function matchVendor(name) {
  return VENDOR_BUDGETS.find((v) => name.startsWith(v.prefix));
}

let mainBundleBytes = 0;
let mainBundleName = "(none)";
const failures = [];

for (const chunk of chunks) {
  const vendor = matchVendor(chunk.name);
  if (vendor !== undefined) {
    const actualKb = (chunk.bytes / 1024).toFixed(1);
    const budgetKb = (vendor.budget / 1024).toFixed(0);
    if (chunk.bytes > vendor.budget) {
      failures.push(
        `[bundle-size] FAIL — vendor chunk \`${chunk.name}\` is ${actualKb} kB gzipped (budget ${budgetKb} kB; ${vendor.label})`
      );
    } else {
      console.log(`[bundle-size] OK — vendor \`${chunk.name}\` ${actualKb} kB (budget ${budgetKb} kB)`);
    }
    continue;
  }
  if (chunk.bytes > mainBundleBytes) {
    mainBundleBytes = chunk.bytes;
    mainBundleName = chunk.name;
  }
}

const limitKb = MAIN_BUNDLE_GZIP_BUDGET_BYTES / 1024;
const actualKb = mainBundleBytes / 1024;
const formatted = `${actualKb.toFixed(1)} kB gzipped (budget ${limitKb.toFixed(0)} kB)`;

if (mainBundleBytes > MAIN_BUNDLE_GZIP_BUDGET_BYTES) {
  failures.push(
    `[bundle-size] FAIL — largest non-vendor chunk \`${mainBundleName}\` is ${formatted}`
  );
}

if (failures.length > 0) {
  for (const line of failures) console.error(line);
  console.error("[bundle-size] If this is expected, raise the relevant budget in scripts/check-bundle-size.mjs.");
  process.exit(1);
}

console.log(`[bundle-size] OK — main \`${mainBundleName}\` is ${formatted}`);
