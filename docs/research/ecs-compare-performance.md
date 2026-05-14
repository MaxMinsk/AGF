---
title: ECS performance — competitive comparison
status: living doc — refresh whenever AGF benchmarks change or competitor data updates
owner: M22 ECS performance epic
related:
  - benchmarks/ecs/
  - docs/research/ecs-benchmarks-baseline.json
  - Notes/ecs_notes.md
---

# ECS performance — competitive comparison

How AGF stacks up against the ECS frameworks people would reasonably ask about. Numbers here are **rough**: AGF runs in a browser tab on V8, most competitors are either native (C/C++/C#/Rust) or use typed-array SoA layouts JS can only partially match. The point isn't a horse race — it's calibration. Are we acceptable, behind by ~10×, or off by orders of magnitude? Different answers drive different next moves.

## TL;DR — where AGF sits today

- **Raw throughput: middle of the pack for browser-JS ECS, ~10–50× slower than typed-array JS ECSs (bitECS / becsy), ~100–1000× slower than native archetype ECSs (Bevy / Flecs / Unity DOTS).** Expected — `Map<ComponentName, Map<EntityId, ComponentData>>` is the simplest possible layout and the easiest to inspect, edit by hand, and serialise via JSON. Speed isn't the design priority.
- **Authoring throughput: top-tier for "agent edits a JSON file and the change shows up".** Every competing ECS makes the human-or-agent author either compile code or write binary-layout component definitions. AGF is the only ECS in this list where the *primary authoring surface is JSON validated by JSON Schema*.
- **The numbers we have today don't gate any current sample.** Beacon-World runs ~50 entities. Hello-3D runs < 30. Real gameplay perf is bottlenecked by renderer draw calls (→ `M17` batching) and hierarchy resolve (→ `M22 / M16-cache`), not ECS storage.

## Snapshot — 2026-05-14

AGF numbers from `docs/research/ecs-benchmarks-baseline.json` (dev MacBook Pro, Node 20, V8). Competitor numbers cited inline; sources at end.

Per-frame budget at 60 FPS = **16.67 ms**. Each row reports a comparable hot-loop operation at 10k entities where possible.

| ECS | Lang | Layout | Iterate 10k 2-comp query (ms) | Iterate 100k (ms) | Notes |
| --- | --- | --- | --- | --- | --- |
| **AGF (this repo)** | TS / V8 | `Map<Comp, Map<Id, Data>>` | **0.37** (uncached) / **<0.001** (cached) | not benched | `createQuery` memoised result is ~18,000× faster than `world.query()` |
| **bitECS** ¹ | TS / V8 | Typed-array SoA + bitset | ~0.01–0.05 | ~0.5–2 | typically published as the fastest browser ECS; component fields are typed-array slots, not objects |
| **becsy** ¹ | TS / V8 | Typed-array SoA + archetype | ~0.01–0.05 | ~0.5–2 | archetype layout; closer to native semantics |
| **Miniplex** ¹ | TS / V8 | Object pools, indexed buckets | ~0.05–0.2 | ~1–5 | ergonomic class API; closer to AGF on layout |
| **ECSY** ¹ | TS / V8 | Class-based, no SoA | ~0.5–2 | ~10–30 | older / Mozilla-archived; usually the slowest |
| **Friflo.Engine.ECS** ² | C# (.NET) | Archetype, struct components | ~0.01 | ~0.1–0.3 | claims ~10× faster than Unity ECS in published comparisons |
| **Unity DOTS** ³ | C# + Burst | Archetype + SIMD-compiled jobs | ~0.001 | ~0.01 | the practical performance ceiling for "shipping game ECS" |
| **Bevy** ³ | Rust | Archetype | ~0.001 | ~0.01 | native, schedule-aware, very fast |
| **Flecs** ³ | C | Archetype | ~0.001 | ~0.01 | likely the absolute fastest ECS; deep query DSL |

Hierarchy resolve / transform pipeline is its own conversation:

| Engine | Approach | 10k chain-of-8 (rough) |
| --- | --- | --- |
| **AGF — no cache** | Full rebuild every frame | **~12.9 ms** |
| **AGF — `M16-cache-a` partial-walk cache, steady-state** | Reuse cached `ResolvedTransform` when nothing dirty | **~5.4 ms (~2.4× win)** |
| **AGF — `M16-cache-a` partial-walk cache, 1% entities mutating per frame** | Re-compose only dirty subtree, reuse the rest | **~8.2 ms (~1.6× win)** |
| **AGF — `M16-cache-b` World.consumeDirty + system-side inputCache, 1%-dirty** | System rebuilds TransformInput only for `world.consumeDirty("Transform")` entries; no per-frame entity scan | **~8.1 ms (~1.6× win — narrow vs M16-cache-a)** ⁵ |
| **AGF target after `M16-cache-c`** | Push dirty-awareness into the cache itself; skip per-entity revision read | < 1 ms (goal) |
| **Unity DOTS TransformSystemGroup** ⁴ | LocalToWorld + parent-version chains, burst-compiled | < 0.1 ms |
| **Three.js scene-graph (raw)** | Per-Object3D `updateMatrixWorld` cascade | ~2–4 ms for 10k flat, climbs fast with depth |

## What that means for AGF

### Where we're fine

- **< 1k entities, flat hierarchies.** Everything is comfortably sub-millisecond. All current samples are here. No change needed; spend engineering time elsewhere.
- **Agent inspection.** `snapshotWorld @ 10k = 2.25 ms` is fine for "every few frames an agent or test snapshots". The bench is a canary for future inspector-overlay work — if we ever build a real-time inspector, this number is what to optimise.
- **Authoring + HMR.** The Map-of-Maps layout means a scene JSON edit lands in the World in microseconds, with no archetype migration or component-id rewiring. This is where we beat bitECS / becsy by orders of magnitude on the *edit cycle*, even though we lose on the *run cycle*.

### Where we're not fine

- **> 1k entities with hierarchies.** `resolveHierarchy chain-of-8 @ 10k = ~13 ms` (no cache) ≈ 77% of a 60 FPS frame. The `M16-cache-a` partial-walk cache brings this down to ~5.4 ms steady / ~8.2 ms with 1% per-frame mutation — usable for a 5k-entity scene, still tight at 10k. `M16-cache-b/c` (incremental indexes, no per-frame O(N) scan) is what pushes this below 1 ms.
- **Per-frame `world.query()`.** Uncached two-component query at 10k = 0.37 ms. Three such systems = > 1 ms of overhead from queries alone, which is a lot when the renderer also wants its slice. **Every system must use `createQuery` and cache the handle.** (`SpinSystem` does; `M21-d` and friends will.)
- **Batch rendering needs batching, not faster ECS.** At 5k visible meshes the bottleneck is draw calls, not ECS iteration. `M17` batching epic is the answer; trying to fix this by switching to bitECS would help the ECS pass go from 1 ms to 0.05 ms while the renderer still spends 80 ms on draw calls.

### The agent-first multiplier

`Notes/ecs_notes.md` made the call to **not** rewrite to archetype ECS. This comparison reinforces it:

- The fastest competitors win by **inverting** the AGF design — they make component layout the primary concern (typed arrays, fixed schemas, generated IDs) and let authoring fall out as a consequence (codegen, binary blobs, build steps).
- AGF inverts back. Authoring is primary (JSON + JSON Schema + hot-reload + diff), and layout falls out. The tradeoff is honest: we lose 10–50× raw throughput vs bitECS, in exchange for a workflow where an agent can write a `*.scene.json` file, validate it with `engine check`, and see it running in HMR within a second.
- The strategy is: **stay at Map-of-Maps until a real game is bottlenecked by it**, then narrow the gap with the targeted M22 sub-epics (LocalToWorld cache, system-level command buffer, explicit indexes) — *not* by adopting an archetype layout that breaks the authoring story.

## How big is "10–50×"?

Concretely:

- A browser game that wants 1k animated entities with parent-child rigs at 60 FPS: AGF needs `M16-cache` first, then it works. bitECS gets there without the cache.
- A browser game that wants 50k particles via ECS at 60 FPS: bitECS handles it on a single core. AGF would not — but `ParticleEmitter` (`M19`) bypasses ECS for particle data anyway, since particles aren't agent-editable entities. ECS-vs-ECS isn't the right comparison; particle systems shouldn't be ECS-iterated in any framework.
- A backend simulating 100k NPCs server-side: this is native-ECS territory (Flecs / Bevy / Friflo). Our reference backend (`examples/backends/node-world-server/`) is Node — same V8 ceiling. The right answer if we need this is a server-side native sim talking to AGF over the protocol, not a faster JS ECS.

In other words: the throughput gap matters in a few specific shapes of game, and for those we have either named M22 work or a non-ECS escape hatch. For everything else (the shape Beacon-World is), AGF is already fast enough.

## Codex Review And Ideas

This doc is pointing in the right direction: it does not pretend AGF can beat native or typed-array ECSs at raw iteration, and it correctly treats the benchmark as calibration rather than a scoreboard. The most important architectural conclusion is worth making explicit:

```text
AGF should keep one ECS source of truth.
Optimized structures are derived indexes/caches, not a second ECS.
```

That distinction matters. A `LocalToWorld` cache, `parent -> children` index, batch buckets, asset-usage index or network-id index is acceptable only if it can be fully rebuilt from `World` + components + commands. If a derived structure starts accepting independent gameplay writes, it has become a second state model and should be rejected.

### Keep

- **Keep `World` as the authoring/runtime contract.** Stable string entity ids, JSON components, schemas, diagnostics and snapshots are the agent-facing product.
- **Keep `createQuery` as the default system pattern.** Systems should create query handles once and reuse them; raw `world.query()` should be treated as an inspect/tooling convenience or a non-hot path.
- **Keep benchmarking by use case.** The useful comparison is not "AGF vs Bevy in a vacuum", but "AGF hierarchy/batching/inspect cost for Beacon-shaped scenes".
- **Keep the native-ECS escape hatch on the server.** If we ever need 100k server-side NPCs, that is a backend architecture decision, not a reason to compromise the browser authoring model.

### Tighten

- **Separate source data from derived data in names.** Prefer names such as `TransformHierarchyCache`, `LocalToWorldCache`, `BatchBucketCache`, and `AssetUsageIndex` so future agents do not mistake them for authoring components.
- **Add rebuild-vs-incremental tests for every cache.** For any derived cache, one test should mutate incrementally and another should rebuild from scratch; the resulting view must match.
- **Measure allocations, not just elapsed time.** Browser jank will come from allocation churn as much as raw query time. `resolveHierarchy` and renderer sync should have allocation-focused benches.
- **Document cache invalidation triggers.** Every cache should list which commands or component writes invalidate it.
- **Treat hierarchy as a transform subsystem, not generic relations.** `Transform.parent` plus a derived children index is enough for now. Generic relation APIs can wait until multiple unrelated systems need them.

### Watch Outs

- **The 10-50x / 100-1000x numbers are directionally useful, not exact.** They compare different runtimes, machines and benchmark styles. Avoid using them as hard claims in public docs without same-machine reproduction.
- **Cached query speed can hide stale-data bugs.** `createQuery` is safe for structural matching, but component data changes do not bump structural revision. That is intended. Do not use query caches for value-based queries unless the cache has value-version invalidation.
- **Hierarchy cache can become the accidental engine core.** Renderer, physics, picking and save/load will all want `LocalToWorld`; keep ownership explicit or every subsystem will grow its own half-cache.
- **Typed arrays are a migration path, not a default.** They are excellent for `LocalToWorld`, particles, batching and network snapshots. They are not a good authoring format.
- **Renderer batching will likely beat ECS storage work in ROI.** If a scene has thousands of visible objects, draw calls dominate first. M17 should stay ahead of broad ECS rewrites.

### Proposed Decision Rules

Use these gates before adding a new optimized ECS-adjacent structure:

- The structure is derived entirely from ECS state.
- It has no public authoring API.
- It can be rebuilt from scratch at any time.
- It has explicit invalidation rules.
- It has tests comparing incremental update to full rebuild.
- It has a benchmark or a measured bottleneck.
- It improves a named system: transform, batching, picking, network, inspect or save/load.

If a proposed optimization fails any of those, keep the simple Map-backed world.

### Suggested Follow-Up Stories

| Story | Why |
| --- | --- |
| `M22-a` ECS benchmark harness hardening | Make `benchmarks/ecs` easy to run locally and keep JSON baselines stable enough for review. |
| `M22-b` Allocation benchmark for hierarchy resolve | Time alone is not enough; prevent frame jank from per-frame matrices/maps/arrays. |
| `M16-cache-b` `TransformHierarchyCache` rebuild/incremental parity tests | Locks the "derived cache, not second ECS" rule into tests. |
| `M21-a` Renderer responsibility audit | The current renderer owns lifecycle, transform sync, material binding and metrics; batching needs those seams named. |
| `M17-a` Batch candidate report in `engine doctor` | Before implementing instancing, report which entities would batch and why others would not. |
| `SYS-a` System authoring rule: query handles only in hot systems | Update agent docs/skills so generated systems do not call raw `world.query()` every frame. |

### Practical Architecture Target

Near-term AGF should look like this:

```text
World
  string ids
  component maps
  command pipeline
  schema-backed data

Derived runtime caches
  TransformHierarchyCache -> LocalToWorld
  QueryHandle cache -> matching entity ids
  BatchBucketCache -> render buckets
  AssetUsageIndex -> diagnostics / HMR
  NetworkEntityIndex -> protocol lookup

Adapters
  renderer
  picking
  physics
  save/load
  backend sync
```

This is still one ECS. The caches are comparable to database indexes: performance structures that are disposable and rebuildable.

## Refresh procedure

This doc is a snapshot. Refresh it when either side moves.

**When AGF benchmarks change** (storage rewrite, M22 sub-epic, new query path):

```bash
npx tsx benchmarks/ecs/index.ts --json > docs/research/ecs-benchmarks-baseline.json
npm run bench:ecs        # for the human table going into the commit
```

Then edit the AGF row in the table above and the "Where we're fine / not fine" lists.

**When competitor data moves**: someone publishes a new bitECS or Bevy comparison, or `js-ecs-benchmarks` adds a contender. Update the row + footnote. Don't try to re-run their benches locally; comparing hot-loop times across machines is noisier than comparing published claims.

**When tradeoffs change** (we adopt archetype ECS, we add bitECS-style typed-array path): the "agent-first multiplier" section needs a rewrite, not just numbers.

## Sources / footnotes

1. **bitECS / becsy / Miniplex / ECSY** — `ddmills/js-ecs-benchmarks` and `noctjs/ecs-benchmark` repositories on GitHub publish standardised iteration benches across these libraries. Numbers above are typical order-of-magnitude bands from those suites; exact values vary 2-3× by machine. Methodology differences (warm-up, sample size) make sub-millisecond comparisons across reports unreliable.
2. **Friflo.Engine.ECS** — `Notes/ecs_notes.md` and the project's own README cite a comprehensive comparison against Arch / DefaultEcs / Unity ECS; ~10× over Unity ECS on the canonical "iterate transforms" loop is the headline number.
3. **Unity DOTS / Bevy / Flecs** — published vendor benchmarks plus the `Skypjack/ecs-benchmark` C++ suite. Native ECSs are typically two orders of magnitude faster than any JS ECS on pure iteration; this is the architectural ceiling of the language + JIT.
4. **Unity DOTS transform pipeline** — Unity Entities `TransformSystemGroup` documentation. Their LocalToWorld matrix + parent-revision approach is the model `M22 / M16-cache` follows.
5. **M16-cache-b narrow win note** — at 1%-dirty / 10k entities the system-level optimisation saves the per-frame `world.entityIds()` scan + the deg→rad conversion for 9,900 clean entities. The cache layer below it still does O(N) revision reads + reference comparisons, which dominate the steady-state cost. M16-cache-c (push dirty-awareness one layer deeper) is what unlocks the < 1 ms target.

Numbers in the tables are **bands**, not point measurements, because:

- AGF samples are real (single MBP, fresh V8 process).
- Competitor numbers are claimed (different machines, different methodology).
- Comparing them as if they were measurable on the same axis would be dishonest.

If we ever need real cross-ECS numbers we'd host the same Beacon-shaped scene in each ECS and run our own suite — not currently planned.
