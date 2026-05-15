# BatchedMesh vs InstancedMesh — shadows-bench measurement (2026-05-15)

## Setup

- Project: `examples/shadows-bench` (305 entities, 3-cascade CSM, PCSS, FXAA).
- Probe: `scripts/perf-probe-batching.mjs` — boots Playwright against the local
  dev server, patches `project.json#render.batching.path`, samples
  `__agf.rendererInfo()` + `__agf.frameTiming()` every 200 ms for 5 s after a
  fresh reload, restores the original config on exit.
- Caveat: headless software-WebGL caps absolute FPS at ~5; the deltas
  below describe the **shape** of the difference, not real wall-clock numbers
  on a desktop GPU. Repeat on the user's hardware before promoting any of
  these findings into design rules.

## Numbers

Means over 12–13 samples per path:

| metric              | instanced | batched   | Δ            |
|---------------------|----------:|----------:|-------------:|
| drawCalls           |     11.00 |      7.00 | **−36 %**    |
| triangles           |  450 662  |  370 092  | **−17.9 %**  |
| renderMs            |     0.53  |     0.87  | **+63.5 %**  |
| frameUpdateMs       |     0.81  |     0.86  | +6.6 %       |
| **totalFrameMs**    |   **1.69**|   **2.09**| **+24 %**    |
| buckets / instances |  3 / 305  |  0 / 0    | (path swap)  |
| batchedBuckets / inst | 0 / 0   |  2 / 305  | (path swap)  |
| programs            |     11    |     11    | 0            |

`drawCalls` includes main + 3 cascades + FXAA + OutputPass.

## Interpretation

- **Per-instance frustum culling worked.** BatchedMesh dropped ~80 000
  triangles and 4 draw calls per frame. With camera framing the village
  most instances are in view, but a tail (~18 %) sits behind the camera or
  past a cascade's far plane and got correctly culled.
- **BatchedMesh's command overhead negated the savings on this scale.**
  Three.js's `BatchedMesh.onBeforeRender` walks all 305 instances each
  render pass (main + each cascade), and the resulting
  `multiDrawArraysIndirect` command carries one drawRange per surviving
  instance. For ~305 instances mostly in view, the GPU command-list cost +
  CPU iteration loop adds 0.34 ms / frame — more than the savings from
  culling.
- **`programs` matched (11 vs 11).** No shader compilation churn — CSM +
  BatchedMesh defines compose cleanly. The earlier "darker scene"
  symptom was unrelated: a separate bug (`updateBatched` squaring the
  per-instance colour against the bucket material colour) was caught
  and fixed in [0760321].

## Crossover point

BatchedMesh should win when *(savings from culled triangles × shader cost
per triangle) > (multi-draw overhead × instance count × pass count)*. On a
~305-instance scene with most instances in view across 4 passes, that
inequality fails. Rough crossover guess for shadows-bench geometry:
- Same scene, RTS camera narrowed to a 1/3-frustum slice → culling drops
  ~60 % of instances → BatchedMesh likely wins.
- ≥ 2 000 instances with similar in-view fraction → BatchedMesh wins via
  GPU-side savings on tail triangles.
- Multi-geometry buckets (different `MeshRenderer.mesh` sharing one
  material — the original BatchedMesh use case) → BatchedMesh wins on
  draw-call reduction alone, before per-instance culling enters the
  picture.

## Decision

- `examples/shadows-bench/project.json` reverts to `path: "instanced"`.
- `render.batching.path: "batched"` stays as a per-project / per-`Batchable`
  option — keep the adapter + system plumbing in place for scenes that
  satisfy the crossover above.
- Next levers to investigate (from `SHADOWS-bench-perf-deepdive`):
  PCSS → PCF A/B; per-cascade triangle counts; hybrid static/dynamic
  shadow update; `M17-bvh-extension` (the BVH path inside
  `@three.ez/batched-mesh-extensions` collapses the per-instance loop
  into a tree walk — could flip the crossover for smaller scenes).

## Reproduce

```
node scripts/perf-probe-batching.mjs --durationMs 5000 --sampleMs 250
# or single path:
node scripts/perf-probe-batching.mjs --paths instanced
```

The probe restores `project.json` on exit (including SIGINT), so it's
safe to run against the user's working tree.
