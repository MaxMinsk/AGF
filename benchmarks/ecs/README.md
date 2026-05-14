# ECS benchmarks

Zero-dep micro-benchmarks for the `engine/core/ecs` hot paths and the renderer's
transform-resolve pipeline. Owned by epic `M22` (`HIGH_LEVEL_BACKLOG.md`).

These are **regression gates**, not performance tuning playgrounds. A bench
exists here only when there's a real epic that depends on its number staying
flat (or improving). Adding a bench means committing to keep it green.

## Run

```bash
npm run bench:ecs                        # human table
npm run bench:ecs -- --json              # JSON for agent consumption / CI
npm run bench:ecs -- --suite query       # filter
```

The runner is `benchmarks/ecs/runner.ts` — a 100-line warmup-then-time loop
with mean / p50 / p99 / ops-per-sec reporting. Each `.bench.ts` file exports
one `runXxxBench(): Promise<SuiteResult>`; register it in
`benchmarks/ecs/index.ts` to wire the CLI.

## Current suites

| Suite | What it locks | Driven by |
|---|---|---|
| `ecs-snapshot` | `snapshotWorld` cost at 100 / 1k / 10k entities. Used by `window.__agf.snapshot()`, `engine inspect`, every Playwright probe. | Agent-facing read perf |
| `ecs-query` | Single- / two-component query + cached `createQuery` handle + rare-match query at 100 / 1k / 10k. | Per-frame system filters |
| `ecs-hierarchy-resolve` | `resolveHierarchy` flat + chain-of-8 at 100 / 1k / 10k. | `ThreeRenderer.buildResolvedTransforms` per-frame cost |

## Baseline numbers

`docs/research/ecs-benchmarks-baseline.json` holds the first-recorded run on
the dev machine that opened the epic. Treat it as a *fixed reference point*,
not as ground truth across hardware. Any future story that touches ECS
storage / query / hierarchy must:

1. Run `npm run bench:ecs -- --json` on the same machine the change is
   developed on, *before* the change.
2. Make the change.
3. Run again; verify mean ms hasn't regressed > 5% on any case (or
   document the tradeoff in the commit message).

Baseline highlights (dev MBP, 2026-05-14):

| Case | mean ms |
|---|---|
| `snapshotWorld @ 10k` | ~2.25 |
| `query(['MeshRenderer','Transform']) @ 10k` (uncached) | ~0.37 |
| `createQuery(...).run() @ 10k` (cached) | ~0.00002 |
| `resolveHierarchy chain-of-8 @ 10k` | ~12.3 |

What these numbers immediately tell us:

- **Systems must use `createQuery`, not `query()` per frame.** Uncached
  two-component query is ~18,000× slower than the cached path. (`SpinSystem`
  already does this; `M21-d MeshLifecycleSystem` and friends must follow.)
- **`resolveHierarchy chain-of-8 @ 10k = 12 ms`** — at 60 FPS budget of
  16.67 ms that's 73% of a frame. `M22 / M16-cache` LocalToWorld
  dirty-flag cache is mandatory if AGF wants > 1k hierarchical entities at
  60 FPS. Number quantifies the urgency.
- **`snapshotWorld @ 10k = 2.25 ms`** — fine for one snapshot per agent
  inspection, not fine for a snapshot-per-frame inspector overlay. If we
  ever build a real-time inspector, this bench is the canary.

## Adding a bench

```ts
// benchmarks/ecs/<topic>.bench.ts
import { createSuite, type SuiteResult } from "./runner";

export async function runMyBench(): Promise<SuiteResult> {
  const suite = createSuite("ecs-<topic>");
  suite.bench("case label", () => {
    // setup runs once per case — build the world, prepare arguments
    const world = makeWorld(...);
    return () => {
      // hot fn runs many times, this is what gets measured
      doTheThing(world);
    };
  });
  return suite.run();
}
```

Then in `benchmarks/ecs/index.ts`:

```ts
import { runMyBench } from "./<topic>.bench";

const SUITES: ReadonlyArray<SuiteEntry> = [
  // ...existing
  { key: "<topic>", run: runMyBench },
];
```

## Not in preflight

`npm run preflight` does *not* run the bench. Micro-benchmark numbers are
noisy across machines and CI runners — they would gate PRs on hardware
variance, not real regressions. Run bench manually on stories that touch ECS
internals; track the JSON output in the story's verification block.
