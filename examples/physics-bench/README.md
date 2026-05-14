# examples/physics-bench/

Perf-only project. Not a game. Boots a camera + ambient + sun + a 24×24 fixed ground plate plus four fixed walls forming a pen; the bootstrap seeds N dynamic primitive bodies floating above the floor that fall, collide, and settle.

Sibling of `examples/batch-bench/` — that one stresses the renderer batcher; this one stresses the Rapier physics adapter and the `PhysicsSyncSystem` fixed-update path.

## Run

```bash
npm run dev
# then open http://localhost:5173/?project=physics-bench
```

## URL params

| Param | Values | Default | Notes |
| --- | --- | --- | --- |
| `count` | integer in `[0, 2048]` | `200` | Number of dynamic bodies. `0` = empty baseline (just walls + floor). |
| `shape` | `box` \| `sphere` \| `capsule` \| (omit for mixed) | mixed | Single-shape mode is useful for isolating contact code paths. |

Examples:

- `?count=400` — 400 mixed-shape bodies in a 8×8 grid stacked across multiple layers.
- `?count=1000&shape=sphere` — 1000 spheres (fastest contact path).
- `?count=0` — empty pen, agent then seeds via `__agf.applyCommands` for ad-hoc scenarios.

## Reading the result

```js
const info = __agf.rendererInfo();
// { drawCalls, buckets, bucketInstances, meshes, ... }
// Bodies are Batchable so the renderer collapses them into 1–3 InstancedMesh
// buckets even at 1000+ count.

const snap = __agf.snapshot();
// snap.entities[i].components.Transform.position[1] — settle height per body.
// Note: dynamic bodies' transforms are written back from Rapier each fixed step.
```

## What this project is NOT

- Not a tutorial.
- Not a gameplay sample.
- Not a place to land project-specific systems — keep gameplay code out so
  the physics numbers stay reproducible across `M24-*` changes.
