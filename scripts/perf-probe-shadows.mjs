#!/usr/bin/env node
// S51 shadows-bench deep-dive probe.
//
// Same shape as `scripts/perf-probe-batching.mjs` but iterates a fixed
// list of named scenarios, each one a JSON patch on
// `examples/shadows-bench/project.json`. Launches a FRESH browser per
// scenario so process-wide one-way settings (PCSS shader-chunk
// substitution) don't carry over between runs.
//
// Output: per-scenario means + pairwise deltas vs baseline.
//
// Usage:
//   node scripts/perf-probe-shadows.mjs
//   node scripts/perf-probe-shadows.mjs --durationMs 6000 --only baseline,pcf,1cascade

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const projectPath = resolve(repoRoot, "examples/shadows-bench/project.json");

const args = parseArgs(process.argv.slice(2));
const durationMs = Number(args.durationMs ?? 5000);
const sampleMs = Number(args.sampleMs ?? 250);
const settleMs = Number(args.settleMs ?? 1500);
const serverUrl = args.server ?? "http://127.0.0.1:5173";
const projectId = args.projectId ?? "shadows-bench";
const only = args.only !== undefined ? new Set(args.only.split(",")) : undefined;

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

// Each scenario is `(name, patch)` where patch is a mutator on a fresh
// project.json clone. Baseline patches nothing.
const scenarios = [
  ["baseline", (j) => j],
  ["pcf", (j) => {
    j.render.shadows.algorithm = "pcf";
    return j;
  }],
  ["2cascades", (j) => {
    j.render.shadows.csm.cascades = 2;
    return j;
  }],
  ["1cascade", (j) => {
    j.render.shadows.csm.cascades = 1;
    return j;
  }],
  ["512map", (j) => {
    j.render.shadows.csm.shadowMapSize = 512;
    return j;
  }],
  ["pcf+512map+2cascades", (j) => {
    j.render.shadows.algorithm = "pcf";
    j.render.shadows.csm.shadowMapSize = 512;
    j.render.shadows.csm.cascades = 2;
    return j;
  }]
];

const originalJson = readFileSync(projectPath, "utf8");

function applyPatch(patch) {
  const next = JSON.parse(originalJson);
  patch(next);
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
      buckets: info.buckets,
      bucketInstances: info.bucketInstances,
      renderMs: timing.renderMs,
      frameUpdateMs: timing.frameUpdateMs,
      totalFrameMs: timing.totalFrameMs
    };
  });
}

function stats(values) {
  if (values.length === 0) return { min: 0, max: 0, mean: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { min, max, mean };
}

function summarise(samples) {
  const keys = Object.keys(samples[0] ?? {});
  const out = {};
  for (const k of keys) out[k] = stats(samples.map((s) => s[k]));
  return out;
}

async function probeOne(name, patch) {
  console.log(`\n=== ${name} ===`);
  applyPatch(patch);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on("pageerror", (err) => console.error(`  [pageerror] ${err.message}`));
    await page.goto(`${serverUrl}/?project=${encodeURIComponent(projectId)}`);
    await awaitReady(page);
    await page.waitForTimeout(settleMs);

    const samples = [];
    const start = Date.now();
    while (Date.now() - start < durationMs) {
      samples.push(await sample(page));
      await page.waitForTimeout(sampleMs);
    }
    const result = summarise(samples);
    console.log(`  ${samples.length} samples over ${Date.now() - start} ms`);
    for (const [metric, stat] of Object.entries(result)) {
      console.log(
        `  ${metric.padEnd(20)} min=${stat.min.toFixed(2).padStart(10)}  mean=${stat.mean.toFixed(2).padStart(10)}  max=${stat.max.toFixed(2).padStart(10)}`
      );
    }
    return result;
  } finally {
    await browser.close();
  }
}

async function run() {
  const results = {};
  try {
    for (const [name, patch] of scenarios) {
      if (only !== undefined && !only.has(name)) continue;
      results[name] = await probeOne(name, patch);
    }

    const baseline = results.baseline;
    if (baseline !== undefined) {
      const others = Object.keys(results).filter((n) => n !== "baseline");
      const keys = Object.keys(baseline);
      console.log(`\n=== deltas vs baseline (mean) ===`);
      const header = ["metric".padEnd(20), "baseline".padStart(10)];
      for (const n of others) header.push(n.padStart(12));
      console.log(header.join(" "));
      for (const k of keys) {
        const row = [k.padEnd(20), baseline[k].mean.toFixed(2).padStart(10)];
        for (const n of others) {
          const m = results[n][k].mean;
          const b = baseline[k].mean;
          const pct = b === 0 ? "—" : `${((m - b) / b * 100).toFixed(1)}%`;
          row.push(`${m.toFixed(2)} (${pct})`.padStart(12));
        }
        console.log(row.join(" "));
      }
    }
  } finally {
    restore();
  }
}

run().catch((err) => {
  console.error(err);
  restore();
  process.exit(1);
});
