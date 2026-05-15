#!/usr/bin/env node
// S51 batching A/B perf probe.
//
// Boots Playwright against an existing dev server on 127.0.0.1:5173,
// opens shadows-bench, then iterates the requested batching paths.
// For each path it:
//   1. Patches `examples/shadows-bench/project.json#render.batching.path`
//   2. Waits for Vite HMR / a forced reload to settle the runtime
//   3. Awaits `__agf.rendererReady`
//   4. Samples `__agf.rendererInfo()` + `__agf.frameTiming()` every
//      `--sampleMs` ms for `--durationMs` ms
//   5. Prints min/max/mean per metric
//
// Restores the original project.json on exit (including SIGINT).
//
// Usage:
//   node scripts/perf-probe-batching.mjs
//   node scripts/perf-probe-batching.mjs --paths instanced,batched,batched-bvh --durationMs 4000
//   node scripts/perf-probe-batching.mjs --projectId batch-bench

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const args = parseArgs(process.argv.slice(2));
const paths = (args.paths ?? "instanced,batched,batched-bvh").split(",").map((s) => s.trim());
const durationMs = Number(args.durationMs ?? 4000);
const sampleMs = Number(args.sampleMs ?? 200);
const settleMs = Number(args.settleMs ?? 1500);
const serverUrl = args.server ?? "http://127.0.0.1:5173";
const projectId = args.projectId ?? "shadows-bench";
const projectPath = resolve(repoRoot, `examples/${projectId}/project.json`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out[key] = "true";
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

const originalJson = readFileSync(projectPath, "utf8");
const original = JSON.parse(originalJson);

function patchPath(path) {
  const next = JSON.parse(originalJson);
  next.render.batching = { ...(next.render.batching ?? {}), path };
  writeFileSync(projectPath, JSON.stringify(next, null, 2));
}

function restore() {
  writeFileSync(projectPath, originalJson);
}

process.on("SIGINT", () => {
  restore();
  process.exit(130);
});

async function awaitReady(page) {
  await page.waitForFunction(
    () => Boolean(window.__agf?.rendererReady),
    undefined,
    { timeout: 30_000 }
  );
  await page.evaluate(async () => {
    await window.__agf.rendererReady;
  });
}

async function sample(page) {
  return page.evaluate(() => {
    const info = window.__agf.rendererInfo();
    const timing = window.__agf.frameTiming();
    return {
      drawCalls: info.drawCalls,
      triangles: info.triangles,
      programs: info.programs,
      geometries: info.geometries,
      meshes: info.meshes,
      buckets: info.buckets,
      bucketInstances: info.bucketInstances,
      batchedBuckets: info.batchedBuckets,
      batchedBucketInstances: info.batchedBucketInstances,
      shadowCasters: info.shadowCasters,
      renderMs: timing.renderMs,
      frameUpdateMs: timing.frameUpdateMs,
      totalFrameMs: timing.totalFrameMs,
      samples: timing.samples
    };
  });
}

function stats(values) {
  const n = values.length;
  if (n === 0) return { min: 0, max: 0, mean: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return { min, max, mean };
}

function summarise(samples) {
  const keys = Object.keys(samples[0] ?? {});
  const out = {};
  for (const k of keys) {
    out[k] = stats(samples.map((s) => s[k]));
  }
  return out;
}

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.error(`[page error] ${err.message}`));

  const results = {};

  try {
    for (const path of paths) {
      console.log(`\n=== probing path: ${path} ===`);
      patchPath(path);
      // Hard reload — Vite watches project.json so HMR would reboot
      // anyway, but a full reload avoids partial-state edge cases.
      await page.goto(`${serverUrl}/?project=${encodeURIComponent(projectId)}`);
      await awaitReady(page);
      await page.waitForTimeout(settleMs);

      const samples = [];
      const start = Date.now();
      while (Date.now() - start < durationMs) {
        samples.push(await sample(page));
        await page.waitForTimeout(sampleMs);
      }
      results[path] = summarise(samples);
      console.log(`  ${samples.length} samples over ${Date.now() - start} ms`);
      for (const [metric, stat] of Object.entries(results[path])) {
        console.log(
          `  ${metric.padEnd(22)} min=${stat.min.toFixed(2).padStart(8)}  mean=${stat.mean.toFixed(2).padStart(8)}  max=${stat.max.toFixed(2).padStart(8)}`
        );
      }
    }

    if (paths.length === 2) {
      const [a, b] = paths;
      console.log(`\n=== delta ${b} vs ${a} (mean) ===`);
      const keys = Object.keys(results[a]);
      for (const k of keys) {
        const ma = results[a][k].mean;
        const mb = results[b][k].mean;
        const delta = mb - ma;
        const pct = ma === 0 ? "—" : `${((delta / ma) * 100).toFixed(1)}%`;
        console.log(`  ${k.padEnd(22)} ${a}=${ma.toFixed(2).padStart(8)}  ${b}=${mb.toFixed(2).padStart(8)}  Δ=${delta.toFixed(2).padStart(8)}  (${pct})`);
      }
    }
  } finally {
    await browser.close();
    restore();
  }

  console.log(`\nproject.json restored to original (path=${original.render?.batching?.path ?? "(unset)"}).`);
}

run().catch((err) => {
  console.error(err);
  restore();
  process.exit(1);
});
