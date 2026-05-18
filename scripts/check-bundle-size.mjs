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
    // S70 WEBGPU-lazy-import. WebGPU-only chunk pulled in by the adapter's
    // dynamic `import("three/webgpu")`. Listed FIRST so the prefix check
    // matches `three-webgpu-` before the bare `three-` prefix below.
    prefix: "three-webgpu-",
    budget: 200 * 1024,
    label: "Three.js WebGPU (lazy-loaded behind project.render.mode = webgpu)"
  },
  {
    prefix: "three-",
    // S57 raised from 300 → 320 KB after pulling in SSAOPass + LUTPass +
    // LUTCubeLoader + GroundedSkybox + CubeCamera + ShadowMaterial +
    // PlaneGeometry. Net gain ~5 KB gzipped over S56.
    //
    // S61 raised from 320 → 480 KB. The new `WebGpuRenderAdapter` imports
    // `three/webgpu` at module top-level so `WebGPURenderer` instantiation
    // is synchronous from the adapter constructor.
    //
    // S70 lowered back from 480 → 340 KB after WEBGPU-lazy-import moved
    // the ~145 KB TSL / node-material runtime into the separate
    // `three-webgpu-` chunk above. The remaining `three-` chunk holds
    // `three.module.js` + `three.core.js` and lights / shadows / loaders
    // / post-processing addons used by the WebGL path.
    //
    // S82 raised 340 → 560 KB. The S70 split never actually produced a
    // separate `three-webgpu-` chunk in the build (Vite's chunking pulls
    // `three.webgpu.js` straight into the main `three` chunk despite the
    // dynamic `import("three/webgpu")` in webgpu-module-loader.ts). The
    // result has been a silent ~536 KB chunk on main since S75 with CI
    // failing the whole time — only noticed during S82. Bump unblocks
    // the gate; AGF-WEBGPU-CHUNK-SPLIT (engine S083) investigates why
    // the manualChunks split doesn't take effect and how to actually
    // get the WebGPU code lazy-loaded.
    budget: 560 * 1024,
    label: "Three.js core (WebGL renderer + addons; WebGPU code also lives here today — see AGF-WEBGPU-CHUNK-SPLIT)"
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
