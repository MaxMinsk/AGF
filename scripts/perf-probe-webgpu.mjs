// S60 WEBGPU-measure-script. Drives the standalone comparison harness
// (`tests/manual/webgpu-vs-webgl/`) under both renderers at three scene
// complexities — light / medium / heavy — and dumps the numbers to
// `docs/research/perf/webgpu-spike-{date}.json`.
//
// Usage:
//   npm run dev   # start vite on :5173
//   node scripts/perf-probe-webgpu.mjs [--levels=light,medium,heavy]
//                                       [--seconds=5]
//                                       [--headed]
//                                       [--out=path]
//
// Note: chromium-headless renders WebGL via swiftshader (software) but
// uses real GPU for WebGPU on macOS / Linux. Numbers from `--headed`
// runs on the user's actual machine are the meaningful comparison.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const argv = Object.fromEntries(
  process.argv.slice(2).flatMap((a) => {
    if (!a.startsWith("--")) return [];
    const [k, v] = a.slice(2).split("=");
    return [[k, v ?? "true"]];
  })
);

const LEVELS = {
  light: { boxes: 50, spheres: 50, shadows: true },
  medium: { boxes: 200, spheres: 200, shadows: true },
  heavy: { boxes: 600, spheres: 600, shadows: true },
  extreme: { boxes: 1500, spheres: 1500, shadows: true }
};

const noVsync = argv["no-vsync"] === "true";

const requestedLevels = (argv.levels ?? "light,medium,heavy")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s in LEVELS);

const sampleSeconds = Math.max(2, Number(argv.seconds ?? 5));
const headed = argv.headed === "true";
const outPath =
  argv.out ?? resolve(repoRoot, "docs/research/perf", `webgpu-spike-${new Date().toISOString().slice(0, 10)}.json`);

async function measure(rendererKind, level) {
  const launchArgs = [];
  if (noVsync) {
    launchArgs.push("--disable-gpu-vsync", "--disable-frame-rate-limit");
  }
  const browser = await chromium.launch({ headless: !headed, args: launchArgs });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  const params = LEVELS[level];
  const url = `http://localhost:5173/tests/manual/webgpu-vs-webgl/?renderer=${rendererKind}&boxes=${params.boxes}&spheres=${params.spheres}&shadows=${params.shadows ? 1 : 0}&fps=0`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(
      () => window.__webgpuSpike?.ready === true && window.__webgpuSpike.framesRendered > 30,
      { timeout: 30000 }
    );
  } catch (err) {
    const state = await page.evaluate(() => window.__webgpuSpike).catch(() => undefined);
    await browser.close();
    return {
      ok: false,
      error: err?.message ?? String(err),
      state: state ?? null,
      errors
    };
  }

  // Inject per-frame sampler.
  await page.evaluate((seconds) => {
    window.__samples = { running: true, frames: [], t0: performance.now() };
    let last = performance.now();
    function tick() {
      if (!window.__samples.running) return;
      const now = performance.now();
      const dt = now - last;
      last = now;
      window.__samples.frames.push({ t: now - window.__samples.t0, dt });
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    // Auto-stop after `seconds`.
    setTimeout(() => {
      window.__samples.running = false;
    }, seconds * 1000);
  }, sampleSeconds);

  await page.waitForTimeout(sampleSeconds * 1000 + 500);
  const summary = await page.evaluate(() => {
    const samples = window.__samples?.frames ?? [];
    // Drop the first 60 frames (warmup).
    const useful = samples.slice(60);
    if (useful.length < 30) return { ok: false, error: "not enough useful samples", count: useful.length };
    const dts = useful.map((f) => f.dt).sort((a, b) => a - b);
    const pct = (p) => dts[Math.min(dts.length - 1, Math.floor(dts.length * p))];
    const sum = dts.reduce((a, x) => a + x, 0);
    return {
      ok: true,
      frames: useful.length,
      duration: (useful[useful.length - 1].t - useful[0].t) / 1000,
      fpsAvg: useful.length / ((useful[useful.length - 1].t - useful[0].t) / 1000),
      frameMsMean: sum / dts.length,
      frameMsP50: pct(0.5),
      frameMsP90: pct(0.9),
      frameMsP95: pct(0.95),
      frameMsP99: pct(0.99),
      frameMsMax: dts[dts.length - 1],
      stutters18: useful.filter((f) => f.dt > 18).length,
      stutters30: useful.filter((f) => f.dt > 30).length,
      rendererInfo: window.__webgpuSpike
    };
  });

  await browser.close();
  return { ok: true, ...summary, errors };
}

async function main() {
  // Verify dev server is up.
  try {
    const res = await fetch("http://localhost:5173/tests/manual/webgpu-vs-webgl/");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error("Dev server not reachable on http://localhost:5173 — run `npm run dev` first.");
    process.exit(1);
  }

  const runs = [];
  for (const level of requestedLevels) {
    for (const renderer of ["webgl", "webgpu"]) {
      process.stdout.write(`[${level}/${renderer}] measuring… `);
      const t0 = Date.now();
      const result = await measure(renderer, level);
      const dt = Date.now() - t0;
      if (!result.ok) {
        console.log(`FAILED in ${dt} ms: ${result.error}`);
      } else {
        console.log(
          `fps=${result.fpsAvg.toFixed(1)} p50=${result.frameMsP50.toFixed(2)} p99=${result.frameMsP99.toFixed(2)} (${dt} ms)`
        );
      }
      runs.push({ level, renderer, params: LEVELS[level], result });
    }
  }

  const out = {
    capturedAt: new Date().toISOString(),
    sampleSeconds,
    headed,
    noVsync,
    runs
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nresults → ${outPath}`);
}

await main();
