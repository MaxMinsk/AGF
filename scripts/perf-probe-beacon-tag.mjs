#!/usr/bin/env node
// S53 BEACON-shadow-caster-tag — A/B probe for the idle-caster
// scenario the S52 deep-dive predicted would benefit most from
// `ShadowCaster { dynamic: true }`.
//
// Toggles the `ShadowCaster` component on the `player.drone` entity
// in `examples/beacon-world/scenes/start.scene.json`, reloads the
// page, samples renderer info for N seconds while the drone sits
// idle (no key presses), then prints both readings + a delta.
//
// Restores the scene file on exit (including SIGINT).
//
// Usage:
//   node scripts/perf-probe-beacon-tag.mjs
//   node scripts/perf-probe-beacon-tag.mjs --durationMs 6000

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const scenePath = resolve(repoRoot, "examples/beacon-world/scenes/start.scene.json");

const args = parseArgs(process.argv.slice(2));
const durationMs = Number(args.durationMs ?? 4000);
const sampleMs = Number(args.sampleMs ?? 250);
const settleMs = Number(args.settleMs ?? 1500);
const serverUrl = args.server ?? "http://127.0.0.1:5173";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = "true";
      else { out[key] = next; i++; }
    }
  }
  return out;
}

const originalScene = readFileSync(scenePath, "utf8");

function setShadowCaster(present) {
  const scene = JSON.parse(originalScene);
  const drone = scene.entities.find((e) => e.id === "player.drone");
  if (drone === undefined) throw new Error("player.drone entity not found");
  if (present) drone.components.ShadowCaster = { dynamic: true };
  else delete drone.components.ShadowCaster;
  writeFileSync(scenePath, JSON.stringify(scene, null, 2));
}

function restore() {
  writeFileSync(scenePath, originalScene);
}

process.on("SIGINT", () => { restore(); process.exit(130); });

async function probeOne(label, taggedDynamic) {
  console.log(`\n=== ${label} ===`);
  setShadowCaster(taggedDynamic);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on("pageerror", (err) => console.error(`  [pageerror] ${err.message}`));
    await page.goto(`${serverUrl}/?project=beacon-world`);
    await page.waitForFunction(() => Boolean(window.__agf?.rendererReady), undefined, { timeout: 30_000 });
    await page.evaluate(async () => { await window.__agf.rendererReady; });
    await page.waitForTimeout(settleMs);

    const samples = [];
    const start = Date.now();
    while (Date.now() - start < durationMs) {
      samples.push(await page.evaluate(() => {
        const info = window.__agf.rendererInfo();
        const t = window.__agf.frameTiming();
        return {
          drawCalls: info.drawCalls,
          triangles: info.triangles,
          renderMs: t.renderMs,
          totalFrameMs: t.totalFrameMs
        };
      }));
      await page.waitForTimeout(sampleMs);
    }
    const stats = {};
    for (const k of Object.keys(samples[0] ?? {})) {
      const vs = samples.map((s) => s[k]);
      stats[k] = vs.reduce((a, b) => a + b, 0) / vs.length;
    }
    console.log(`  ${samples.length} samples`);
    for (const [k, v] of Object.entries(stats)) {
      console.log(`  ${k.padEnd(20)} mean=${v.toFixed(2)}`);
    }
    return stats;
  } finally {
    await browser.close();
  }
}

(async () => {
  try {
    const off = await probeOne("ShadowCaster tag absent (S52 default — autoUpdate=true)", false);
    const on = await probeOne("ShadowCaster { dynamic: true } (S53 idle-caster path)", true);

    console.log("\n=== delta (mean, on vs off) ===");
    for (const k of Object.keys(off)) {
      const ma = off[k];
      const mb = on[k];
      const pct = ma === 0 ? "—" : `${((mb - ma) / ma * 100).toFixed(1)}%`;
      console.log(`  ${k.padEnd(20)} off=${ma.toFixed(2).padStart(10)}  on=${mb.toFixed(2).padStart(10)}  Δ=${(mb - ma).toFixed(2).padStart(10)} (${pct})`);
    }
  } finally {
    restore();
  }
})().catch((err) => { console.error(err); restore(); process.exit(1); });
