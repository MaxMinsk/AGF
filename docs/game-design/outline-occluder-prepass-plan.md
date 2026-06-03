# Outline-Occluder Pre-Pass — Implementation Plan

## Why we need this

The S277 viewport-depth NodeMaterial path (current `engine/render/systems/outline-occluder-system.ts`) is fundamentally limited: it samples the **live** framebuffer depth, which contains both the world geometry AND the bomber's own body parts. The smoothstep can either:

- Use a wide `softEdge` (≥0.04 of linear depth) — suppresses head-vs-torso intra-bomber bleed, but cross-wall silhouettes go nearly invisible at close occluder distances (a 1m hard block in front of a bomber projects to only ~0.006 of linear depth, well below the feather).
- Use a tight `softEdge` (≤0.005) — restores cross-wall visibility, but the intra-bomber delta (~0.004) sits inside the feather and parts bleed through each other.

Both deltas overlap because the camera is orthographic at -55° pitch with `far = 100`. **A single-pass shader cannot tell "occluded by a wall" apart from "occluded by my own head" using one shared depth buffer.**

A pre-pass that excludes bomber meshes from the sampled depth target removes the ambiguity: the outline material only ever sees WORLD depth, never intra-bomber depth. Then a tight `softEdge` works correctly in every case.

## Target experience

When a bomber (player or NPC) is behind a hard / soft block from the camera's perspective, paint a **solid palette-colour silhouette** through the occluder. When the bomber is fully visible, draw nothing. No intra-bomber bleed. Survives map restarts. Works on WebGPU (kaboom-crew's runtime backend); WebGL stays graceful (feature off, no errors).

Same machinery should generalise to **bombs** (single sphere per placed bomb, placer-palette tinted) in a follow-up step.

## Architecture

```
                                            ┌────────────────────────┐
                                            │ World (ECS)            │
                                            │ • bomber parts         │
                                            │ • outline duplicates   │
                                            │ • walls / floor /…     │
                                            └───────────┬────────────┘
                                                        │
                                                        ▼
   per-frame:
   ┌─────────────────────────────────────────────────────────────────┐
   │ render.outline-prepass (engine)                                 │
   │  1. iterate adapter.outlinePrePassExcludedMeshes() → toggle     │
   │     mesh.visible = false                                        │
   │  2. adapter.renderSceneToTarget(rtHandle, scene, camera)        │
   │     – fills the RT's DepthTexture with WORLD-only depth         │
   │  3. restore mesh.visible                                        │
   │  Exposes `getDepthTexture(): DepthTexture | undefined`          │
   └───────────────────────────────────────────────────────────────┬─┘
                                                                    │
                                                                    ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ render.outline-occluder (engine)                                │
   │  for each entity with OutlineOccluder + RenderMeshHandle:       │
   │    – setMeshVisible(handle, false) (hide until material ready)  │
   │    – await createOutlineOccluderMaterial({                      │
   │         depthTexture: prepass.getDepthTexture(), …              │
   │      })                                                         │
   │    – setMeshMaterial(handle, mat)                               │
   │    – setMeshVisible(handle, true)                               │
   └─────────────────────────────────────────────────────────────────┘
```

## Step-by-step

### 1 · Engine adapter API (already partly present)

We already have:
- `acquireRenderTarget({ depthTexture: true })`
- `renderSceneToTarget(handle, scene, camera)`
- `getRenderTargetDepthTexture(handle)`
- `setMeshVisible(handle, visible)`
- `setMeshMaterial(handle, material)`

We need to add (or re-add — these existed briefly in S277b but were rolled back):
- `getScene(): Scene` — public read access for the prepass system.
- `getActiveCamera(): PerspectiveCamera | OrthographicCamera | undefined` — same.
- `setMeshOutlinePrePassExcluded(handle, excluded: boolean)` — tags a mesh into a `Set<Mesh>` the prepass system iterates.
- `outlinePrePassExcludedMeshes(): ReadonlySet<Mesh>` — read-only view of that set.

The `setMeshVisible` toggle is targeted at the bomber meshes — no layer-mask juggling, no impact on shadow / reflection / planar-mirror cameras.

### 2 · ECS plumbing

New engine ECS component **`OutlinePrePassExcluded {}`** (marker, no fields). Any entity tagged with this AND `RenderMeshHandle` is automatically excluded from the pre-pass.

In the engine `render.outline-prepass` system:
- Cache query `[OutlinePrePassExcluded, RenderMeshHandle]`.
- Maintain `flaggedHandles: Set<number>` — diff against the query each frame so a dropped component un-flags the handle (round reset, death cleanup).
- Forward additions / removals to `adapter.setMeshOutlinePrePassExcluded(handle, true/false)`.

The kaboom `bomber-outline-system` writes `OutlinePrePassExcluded` on every bomber body part it discovers (in addition to spawning the outline duplicate with `OutlineOccluder`). The outline duplicates also need to be excluded — they would otherwise contribute their `transparent + depthWrite=false` material to the pre-pass and pollute it. Tag them too.

### 3 · Engine `render.outline-prepass` system

New file `engine/render/systems/outline-prepass-system.ts`. Per-frame:

1. Lazy-acquire one `RenderTarget` with `depthTexture: true` at half canvas resolution (configurable; 0.5× balances detail vs cost).
2. Resize on canvas resize.
3. If no entity has `OutlineOccluder`, the pass is dormant — early return, no GPU work.
4. Otherwise:
   - Snapshot `mesh.visible` for every mesh in `adapter.outlinePrePassExcludedMeshes()`.
   - Set them to `false`.
   - `adapter.renderSceneToTarget(rt, scene, camera)`.
   - Restore the snapshot.
5. Expose the depth texture via a `getDepthTexture()` method on the system handle.

Register **before** `render.outline-occluder` in `engine/runtime/start.ts` so the occluder system has the latest depth on its first use.

### 4 · Switch the WebGPU outline material to the pre-pass depth variant

`engine/render/webgpu/outline-node-material.ts` already has `createOutlineOccluderMaterial({ depthTexture, color, opacity, softEdge })` (the pre-pass variant from S186 — currently unused since S277 switched to the viewport variant). The wiring is:

```ts
const sampled = t.texture(opts.depthTexture, t.screenUV);
const sceneDepth = sampled.r;                       // raw depth from pre-pass RT
const myDepth   = t.screenCoordinate.z;             // current fragment's NDC depth
const occluded  = t.smoothstep(t.float(0), t.float(softEdge), myDepth.sub(sceneDepth));
```

Earlier we hit "the WebGPU backend doesn't sample a custom DepthTexture via `t.texture(...)` cleanly" — that was on an older Three.js version. r0.184 in the project today sets a sampleable DepthTexture by default; the existing `engine/render/three-render-adapter.ts#acquireRenderTarget` already configures it that way. The pre-pass variant should Just Work.

Verification path:
1. Bring up the dev server.
2. Place a bomber behind a hard block.
3. Toggle `?occluderOutline=off` vs default ON; visually compare via the existing `__agf/renderer-inspect` + a screenshot probe.

### 5 · Material lifecycle change

The pre-pass `DepthTexture` is owned by the adapter's render-target. When the prepass system's RT is recreated (e.g., canvas resize) the depth texture reference changes. The outline material captures the texture reference inside its TSL graph at creation time, so we need to **rebuild outline materials when the depth texture changes**.

Strategy:
- Outline-occluder system records `state.depthTextureRef` per entity.
- On each frame, compare against `prepass.getDepthTexture()`. If different, dispose the material + re-create.

Implementation already drafted in the S277b commit history (since rolled back) — that path's logic is sound and can be ported.

### 6 · Kaboom-side wiring

`bomber-outline-system.ts`:
- Keep current query + spawn loop.
- For every bomber part it walks: `world.setComponent(partId, "OutlinePrePassExcluded", {})` (idempotent — check `hasComponent` first to keep ECS dirty-flag clean).
- For every outline duplicate it creates: write the same `OutlinePrePassExcluded` tag.

`bomb-outline-system.ts` (re-introduce in the same shape, but ONLY after the prepass infrastructure is verified working for bombers):
- Spawn `<bombId>.outline-occluder` with `MeshRenderer { mesh: "sphere" }` + `OutlineOccluder { color, opacity: 0.85, softEdge: 0.01 }` + tag the bomb itself with `OutlinePrePassExcluded`.
- Tighter softEdge (0.01) is safe because the pre-pass has no bomb depth to false-positive against.

### 7 · Failure modes + WebGL fallback

- **WebGL runtime**: NodeMaterial path bails (`webgpuActive === false`) — current behaviour. No outline at all on WebGL is the safer choice over a half-broken depthFunc patch.
- **Pre-pass RT acquire failure**: `getDepthTexture()` returns `undefined`, the outline-occluder system skips material creation, mesh stays `visible = false`. Better than a default white overlay.
- **Async material load error**: existing `try / catch` logs `[render.outline-occluder]` warning and leaves the mesh hidden.

### 8 · Cost analysis

- One extra scene render per frame, at half canvas resolution, depth-only.
- For the current kaboom-crew arena (~80 meshes including bomber parts), this is a few hundred extra triangles drawn into a smaller RT — well under 1ms on a recent GPU.
- Dormant when no entity has `OutlineOccluder` (every project that doesn't opt in pays zero cost).

### 9 · Tests

Engine unit tests (with a fake adapter recording calls):
- Dormant when no OutlineOccluder entity exists.
- Excludes both OutlineOccluder + OutlinePrePassExcluded handles, runs the pre-pass render.
- Drops exclusion when the tagging component is removed.
- Exposes `depthTexture` after the first pass.

Kaboom unit tests (existing 5 + new):
- Existing bomber-outline tests pass with the OutlinePrePassExcluded tag added.
- New: bomber body parts have `OutlinePrePassExcluded` after one frame.
- New: outline duplicates also have `OutlinePrePassExcluded` (so they don't poison the prepass depth).

### 10 · Rollout order

1. **Story `S278`** — engine prepass infrastructure: adapter API additions + `render.outline-prepass` system + `OutlinePrePassExcluded` component + engine unit tests. No project-side change yet — the new system is dormant.
2. **Story `S279`** — switch `render.outline-occluder` to the pre-pass depth variant + kaboom `bomber-outline-system` tags `OutlinePrePassExcluded`. After this commit: bomber silhouettes work cleanly through walls, no intra-bomber bleed. softEdge tightens to 0.01.
3. **Story `S280`** — re-introduce `bomb-outline-system` on top of the now-stable pre-pass. Single-sphere silhouettes, placer-palette tinted.
4. **Story `S281`** — performance pass: validate half-resolution depth is sufficient, measure GPU cost via `__agf/renderer-inspect.gpuMs`.

## Open questions

1. **Resolution scale**: half-canvas is the proposed default. Worth a slider in `__agf` debug for tuning?
2. **Re-pre-pass cadence**: every frame is conservative. If bombers move slowly and the world is mostly static, we could amortise — but the cost is already small and frame-skipped depth feels stale on a fast-moving bomber. Keep per-frame.
3. **Other moving occluders**: bombs (when re-introduced) should NOT be in the pre-pass excluded set if they themselves count as occluders for OTHER bombers' silhouettes. Probably they should NOT — a bomb in front of a bomber should still show the bomber's silhouette. Confirm with game-design intent.
