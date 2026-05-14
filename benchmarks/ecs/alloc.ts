// M22-allocations: allocation-focused bench. Wall-time alone hides the
// kind of per-frame heap churn that drives browser jank. Each case warms
// the JIT, optionally forces GC, then measures `heapUsed` delta across
// N iterations to report bytes-per-op.
//
// Usage:
//   npm run bench:ecs:alloc                 # human table
//   npm run bench:ecs:alloc -- --json       # machine-readable
//
// Pass `--expose-gc` to node for reliable numbers (the script will use
// `globalThis.gc()` to settle before / between cases). Without it the
// numbers are noisier but the relative ranking is still useful.

import { performance } from "node:perf_hooks";

import { createHierarchyCache } from "../../engine/core/transform/resolve-cached";
import { resolveHierarchy, type TransformInput } from "../../engine/core/transform/resolve";
import { snapshotWorld } from "../../engine/runtime/inspect";
import type { TimeContext } from "../../engine/core/loop/types";
import { ENTITY_SIZES, makeWorld } from "./scene-fixtures";

const TIME: Readonly<TimeContext> = Object.freeze({
  elapsed: 0,
  dt: 1 / 60,
  fixedDt: 1 / 60,
  frameCount: 0,
  fixedStepCount: 0
});

type AllocResult = {
  name: string;
  iterations: number;
  heapDeltaKb: number;
  bytesPerOp: number;
  ns: number;
};

function forceGc(): void {
  const g = globalThis as { gc?: () => void };
  if (typeof g.gc === "function") {
    g.gc();
    g.gc();
  }
}

function measureAlloc(name: string, setup: () => () => void, iterations: number): AllocResult {
  const hot = setup();
  for (let i = 0; i < 50; i += 1) hot();
  forceGc();
  const before = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  for (let i = 0; i < iterations; i += 1) hot();
  const t1 = performance.now();
  const after = process.memoryUsage().heapUsed;
  const heapDelta = after - before;
  return {
    name,
    iterations,
    heapDeltaKb: heapDelta / 1024,
    bytesPerOp: heapDelta / iterations,
    ns: ((t1 - t0) * 1_000_000) / iterations
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const wantsJson = args.includes("--json");
  const gcAvailable = typeof (globalThis as { gc?: () => void }).gc === "function";
  if (!gcAvailable) {
    process.stderr.write("[alloc] node not started with --expose-gc; numbers will be noisier.\n");
  }

  const cases: Array<{ name: string; setup: () => () => void; iters: number }> = [];

  for (const size of ENTITY_SIZES) {
    cases.push({
      name: `resolveHierarchy chain-of-8 @ ${size.toLocaleString("en-US")}`,
      iters: size <= 1_000 ? 200 : 20,
      setup: () => {
        const inputs = buildInputs(size);
        return () => {
          resolveHierarchy(inputs);
        };
      }
    });
    cases.push({
      name: `cached steady-state chain-of-8 @ ${size.toLocaleString("en-US")}`,
      iters: size <= 1_000 ? 500 : 50,
      setup: () => {
        const world = makeWorld({ entities: size, hierarchy: true });
        const cache = createHierarchyCache();
        cache.resolveWorld(world);
        return () => {
          cache.resolveWorld(world);
        };
      }
    });
    cases.push({
      name: `cached 1%-dirty chain-of-8 @ ${size.toLocaleString("en-US")}`,
      iters: size <= 1_000 ? 200 : 20,
      setup: () => {
        const world = makeWorld({ entities: size, hierarchy: true });
        const cache = createHierarchyCache();
        cache.resolveWorld(world);
        const mutateCount = Math.max(1, Math.floor(size / 100));
        let cursor = 0;
        return () => {
          for (let i = 0; i < mutateCount; i += 1) {
            const id = `e${cursor}`;
            cursor = (cursor + 1) % size;
            const t = world.getComponent<Record<string, unknown>>(id, "Transform");
            if (t === undefined) continue;
            world.setComponent(id, "Transform", { ...t, position: [Math.random(), 0, 0] });
          }
          cache.resolveWorld(world);
        };
      }
    });
    cases.push({
      name: `snapshotWorld @ ${size.toLocaleString("en-US")}`,
      iters: size <= 1_000 ? 200 : 20,
      setup: () => {
        const world = makeWorld({ entities: size });
        return () => {
          snapshotWorld(world, TIME);
        };
      }
    });
  }

  const results: AllocResult[] = [];
  for (const c of cases) {
    results.push(measureAlloc(c.name, c.setup, c.iters));
  }

  if (wantsJson) {
    console.log(JSON.stringify({ gc: gcAvailable, cases: results }, null, 2));
    return;
  }

  console.log(`# alloc bench (gc=${gcAvailable ? "yes" : "no"})`);
  const header = ["case", "iters", "ns/op", "bytes/op", "heap delta KB"];
  const rows = results.map((r) => [
    r.name,
    String(r.iterations),
    r.ns.toFixed(0),
    r.bytesPerOp.toFixed(0),
    r.heapDeltaKb.toFixed(1)
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );
  const fmt = (row: ReadonlyArray<string>): string =>
    row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ");
  const separator = widths.map((w) => "-".repeat(w)).join("  ");
  console.log(fmt(header));
  console.log(separator);
  for (const row of rows) console.log(fmt(row));
}

function buildInputs(size: number): TransformInput[] {
  const world = makeWorld({ entities: size, hierarchy: true });
  const inputs: TransformInput[] = [];
  for (const id of world.entityIds()) {
    const t = world.getComponent<Record<string, unknown>>(id, "Transform");
    if (t === undefined) continue;
    const entry: TransformInput = { id };
    if (typeof t["parent"] === "string") entry.parent = t["parent"];
    const pos = t["position"];
    const rot = t["rotation"];
    const scl = t["scale"];
    if (Array.isArray(pos)) entry.position = [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0];
    if (Array.isArray(rot)) entry.rotation = [rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0];
    if (Array.isArray(scl)) entry.scale = [scl[0] ?? 1, scl[1] ?? 1, scl[2] ?? 1];
    inputs.push(entry);
  }
  return inputs;
}

void main();
