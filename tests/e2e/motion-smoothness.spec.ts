// S83 AGF-MOTION-SMOOTHNESS-PROBE.
//
// Measures requestAnimationFrame delta jitter while the kaboom-crew
// player walks across the arena. Captures per-frame deltas in the
// page, ships them back, and reports median / P95 / max / "stalls".
//
// Threshold rationale: at 60 Hz the ideal dt is ~16.7 ms; at 120 Hz
// it's ~8.3 ms. We assert P95 ≤ 25 ms which keeps the smoke project
// honest about whether GridMover / scheduler / renderer is introducing
// visible micro-stutter without flapping on transient OS noise.

import { test, expect } from "@playwright/test";

// Headless Chromium throttles requestAnimationFrame heavily (the page
// is treated as backgrounded), so the probe consistently sees
// ~50 ms frame deltas regardless of what the engine does. Run headed
// so the measurement reflects what a developer actually perceives.
// CI without a display will skip this spec (the env flag is set by
// scripts/preflight.sh when DISPLAY is missing).
test.use({ headless: false });

type FrameStats = {
  count: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  stalls: number;
};

type MotionStats = {
  count: number;
  meanStepWorld: number;
  stdevStepWorld: number;
  cv: number; // coefficient of variation — stdev / mean
  zeroSteps: number; // frames the entity didn't move at all
  bigSteps: number; // frames where the entity moved > 2× the mean
};

function percentile(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx] ?? 0;
}

function summarize(samples: ReadonlyArray<number>): FrameStats {
  if (samples.length === 0) return { count: 0, medianMs: 0, p95Ms: 0, maxMs: 0, stalls: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const stalls = samples.filter((dt) => dt > 40).length;
  return {
    count: samples.length,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1] ?? 0,
    stalls
  };
}

function summarizeMotion(positions: ReadonlyArray<[number, number]>): MotionStats {
  if (positions.length < 2) return { count: 0, meanStepWorld: 0, stdevStepWorld: 0, cv: 0, zeroSteps: 0, bigSteps: 0 };
  const steps: number[] = [];
  for (let i = 1; i < positions.length; i += 1) {
    const a = positions[i - 1]!;
    const b = positions[i]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    steps.push(Math.hypot(dx, dz));
  }
  // Drop the first 2 steps (boot churn) and the last 5 (deceleration
  // window after arrival) so we measure the steady-state cadence.
  const trimmed = steps.slice(2, Math.max(2, steps.length - 5));
  if (trimmed.length === 0) return { count: steps.length, meanStepWorld: 0, stdevStepWorld: 0, cv: 0, zeroSteps: 0, bigSteps: 0 };
  const mean = trimmed.reduce((sum, s) => sum + s, 0) / trimmed.length;
  const variance = trimmed.reduce((sum, s) => sum + (s - mean) ** 2, 0) / trimmed.length;
  const stdev = Math.sqrt(variance);
  const zeroSteps = trimmed.filter((s) => s < mean * 0.1).length;
  const bigSteps = trimmed.filter((s) => s > mean * 2).length;
  return {
    count: trimmed.length,
    meanStepWorld: mean,
    stdevStepWorld: stdev,
    cv: mean > 0 ? stdev / mean : 0,
    zeroSteps,
    bigSteps
  };
}

test("@motion-smoothness gotoCell across 7 cells stays under jitter budget", async ({ page, baseURL }) => {
  test.setTimeout(45_000);
  // Headless CI skips — rAF cadence is OS-throttled and doesn't reflect
  // what a developer sees in a browser window.
  test.skip(process.env["CI"] === "true" && process.env["MOTION_SMOOTHNESS"] !== "1", "headed-only probe; opt in with MOTION_SMOOTHNESS=1");
  await page.goto(new URL("/?project=kaboom-crew", baseURL ?? "http://localhost:5173").toString(), {
    waitUntil: "networkidle"
  });
  await page.waitForFunction(() => (window as unknown as { __agf?: { kaboom?: { gotoCell?: unknown } } }).__agf?.kaboom?.gotoCell !== undefined, { timeout: 15_000 });
  // Let the world settle for ~1 s — first paint, dev-bridge wiring,
  // asset upload churn.
  await page.waitForTimeout(1000);

  // Run the probe + the walk concurrently inside one evaluate so we
  // capture only the gotoCell window. Two streams are gathered:
  //   - rAF frame deltas (browser cadence)
  //   - player Transform.position per frame (engine smoothness)
  const capture = await page.evaluate<{
    deltas: number[];
    positions: Array<[number, number]>;
  }>(async () => {
    const w = window as unknown as {
      __agf: {
        kaboom: {
          gotoCell(id: string, gx: number, gz: number, opts?: { timeoutMs?: number }): Promise<unknown>;
          worldXZ(id: string): [number, number] | undefined;
        };
      };
    };
    const deltas: number[] = [];
    const positions: Array<[number, number]> = [];
    let running = true;
    let prev = performance.now();
    const readPlayerPos = (): [number, number] | undefined => w.__agf.kaboom.worldXZ("player.1");
    const tick = (): void => {
      if (!running) return;
      const now = performance.now();
      deltas.push(now - prev);
      prev = now;
      const p = readPlayerPos();
      if (p !== undefined) positions.push(p);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await w.__agf.kaboom.gotoCell("player.1", 8, 1, { timeoutMs: 12_000 });
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    running = false;
    return { deltas: deltas.slice(1), positions };
  });

  const frame = summarize(capture.deltas);
  const motion = summarizeMotion(capture.positions);

  await test.info().attach("motion-smoothness.json", {
    body: JSON.stringify({ frame, motion, samples: capture.deltas, positions: capture.positions }, null, 2),
    contentType: "application/json"
  });
  // eslint-disable-next-line no-console
  console.log(
    `[motion-smoothness] frame: n=${frame.count} median=${frame.medianMs.toFixed(2)} ms p95=${frame.p95Ms.toFixed(2)} ms max=${frame.maxMs.toFixed(2)} ms stalls(>40ms)=${frame.stalls}`
  );
  // eslint-disable-next-line no-console
  console.log(
    `[motion-smoothness] motion: n=${motion.count} meanStep=${motion.meanStepWorld.toFixed(4)} stdev=${motion.stdevStepWorld.toFixed(4)} cv=${(motion.cv * 100).toFixed(1)}% zeroSteps=${motion.zeroSteps} bigSteps=${motion.bigSteps}`
  );

  expect(frame.count).toBeGreaterThan(60); // walked ≥ 1 s
  expect(frame.p95Ms).toBeLessThanOrEqual(25);
  expect(frame.maxMs).toBeLessThanOrEqual(80);
  // Motion smoothness budget: ≤ 5% of trimmed frames are "zero" (entity
  // didn't advance — micro-stutter signature on cell boundaries) and
  // step-size CV stays under 50% (coefficient of variation — large
  // values flag uneven per-frame motion).
  expect(motion.count).toBeGreaterThan(60);
  expect(motion.zeroSteps / motion.count).toBeLessThanOrEqual(0.05);
  expect(motion.cv).toBeLessThanOrEqual(0.5);
});
