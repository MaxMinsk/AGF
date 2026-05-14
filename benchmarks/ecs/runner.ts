// Zero-dep micro-bench runner for ECS perf gates (M22 / ECS-B1).
//
// Why hand-rolled? `tinybench` would work, but pulling a dep just to time
// ECS calls increases the agent's trust surface for no benefit. The math
// here is straightforward: warm-up, time N iterations, report mean / p50 /
// p99 / ops-per-sec. Output is a human table or JSON for agent consumption.
//
// Usage:
//   const suite = createSuite("ecs-snapshot");
//   suite.bench("snapshot @ 1k entities", (run) => {
//     const world = makeWorld(1000);
//     return () => snapshotWorld(world, time);
//   });
//   await suite.run();
//
// The inner function (returned from setup) is the hot path: setup runs once
// per case, the hot fn is called many times.

import { performance } from "node:perf_hooks";

export type BenchCaseFn = () => unknown;

export type BenchSetupFn = () => BenchCaseFn;

export type BenchCaseResult = {
  name: string;
  iterations: number;
  totalMs: number;
  meanMs: number;
  p50Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
};

export type SuiteResult = {
  name: string;
  cases: BenchCaseResult[];
};

export type SuiteOptions = {
  /** Target runtime per case in ms. Loop stops once this budget is consumed (after the minimum iteration count). Default 500 ms. */
  durationMs?: number;
  /** Minimum iterations regardless of duration. Default 50. */
  minIterations?: number;
  /** Iterations to discard for warm-up. Default 10. */
  warmupIterations?: number;
};

const DEFAULT_DURATION_MS = 500;
const DEFAULT_MIN_ITERATIONS = 50;
const DEFAULT_WARMUP = 10;

export type Suite = {
  readonly name: string;
  bench(name: string, setup: BenchSetupFn): void;
  run(): Promise<SuiteResult>;
};

export function createSuite(name: string, options: SuiteOptions = {}): Suite {
  const cases: Array<{ name: string; setup: BenchSetupFn }> = [];
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
  const minIterations = options.minIterations ?? DEFAULT_MIN_ITERATIONS;
  const warmupIterations = options.warmupIterations ?? DEFAULT_WARMUP;

  return {
    name,
    bench(caseName: string, setup: BenchSetupFn): void {
      cases.push({ name: caseName, setup });
    },
    async run(): Promise<SuiteResult> {
      const results: BenchCaseResult[] = [];
      for (const c of cases) {
        results.push(runCase(c.name, c.setup, { durationMs, minIterations, warmupIterations }));
      }
      return { name, cases: results };
    }
  };
}

function runCase(
  name: string,
  setup: BenchSetupFn,
  opts: Required<SuiteOptions>
): BenchCaseResult {
  const hot = setup();

  // Warm-up — discarded.
  for (let i = 0; i < opts.warmupIterations; i += 1) {
    hot();
  }

  const samples: number[] = [];
  const deadline = performance.now() + opts.durationMs;
  let iter = 0;
  while (iter < opts.minIterations || performance.now() < deadline) {
    const t0 = performance.now();
    hot();
    const dt = performance.now() - t0;
    samples.push(dt);
    iter += 1;
    if (iter >= 100_000) {
      // Safety stop for trivially-fast cases — > 100k samples saturate the
      // sort below without helping accuracy.
      break;
    }
  }

  samples.sort((a, b) => a - b);
  const totalMs = samples.reduce((a, b) => a + b, 0);
  const meanMs = totalMs / samples.length;
  const p50Ms = percentile(samples, 0.5);
  const p99Ms = percentile(samples, 0.99);
  const minMs = samples[0] ?? 0;
  const maxMs = samples[samples.length - 1] ?? 0;
  const opsPerSec = meanMs > 0 ? 1000 / meanMs : Infinity;

  return {
    name,
    iterations: samples.length,
    totalMs,
    meanMs,
    p50Ms,
    p99Ms,
    minMs,
    maxMs,
    opsPerSec
  };
}

function percentile(sortedSamples: ReadonlyArray<number>, q: number): number {
  if (sortedSamples.length === 0) return 0;
  const index = Math.min(sortedSamples.length - 1, Math.floor(sortedSamples.length * q));
  return sortedSamples[index] ?? 0;
}

export function formatTable(result: SuiteResult): string {
  const header = ["case", "iters", "mean ms", "p50 ms", "p99 ms", "ops/sec"];
  const rows = result.cases.map((c) => [
    c.name,
    String(c.iterations),
    c.meanMs.toFixed(4),
    c.p50Ms.toFixed(4),
    c.p99Ms.toFixed(4),
    Math.round(c.opsPerSec).toLocaleString("en-US")
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );
  const fmt = (row: ReadonlyArray<string>): string =>
    row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ");
  const separator = widths.map((w) => "-".repeat(w)).join("  ");
  return [`# ${result.name}`, fmt(header), separator, ...rows.map(fmt)].join("\n");
}

export function formatJson(results: ReadonlyArray<SuiteResult>): string {
  return JSON.stringify({ suites: results }, null, 2);
}
