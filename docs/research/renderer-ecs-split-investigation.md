---
title: Renderer → ECS systems — investigation
status: draft (Sprint 33 / M21-investigate)
owner: agent-first rendering
related:
  - HIGH_LEVEL_BACKLOG.md M21, M17, M22
  - CLAUDE.md (Prefer ECS systems by default)
  - engine/render/three-renderer.ts
  - engine/core/systems/scheduler.ts
  - engine/core/systems/types.ts
  - engine/runtime/start.ts
  - docs/ARCHITECTURE.md
---

# Renderer → ECS systems — investigation

Sprint 33 / story `M21-investigate`. Investigation only — no code lands from this doc. It produces (a) a justified split target, (b) a story sequence, (c) measurement gates that have to be green before any storage / system rearrangement merges.

## 1. Why now

Three drivers converged:

- **`CLAUDE.md` "Prefer ECS systems by default" rule** (Sprint 32). `ThreeRenderer` is the largest piece of runtime behaviour still shaped as one monolithic class. New work — `M17` ECS-native batching, `M22` LocalToWorld cache, `M21-shader-pipeline` — keeps wanting to either reach into the class or fork-and-modify it. Splitting first removes the "where does this go?" coin-flip every future renderer task.
- **`M17` batching** needs a stable per-frame collection pass that reads `MeshRenderer + Transform` and groups by `mesh + material + render-policy`. That pass is structurally a `System`, not a renderer method.
- **`M22` perf discipline**. Benchmarks (`ECS-B*`) measure "how long does the per-system phase take", not "how long does an opaque renderer method take". A monolithic `render()` is one black-box number; split systems give per-phase numbers we can regress-test.

## 2. Current state: audit of `ThreeRenderer`

File: `engine/render/three-renderer.ts` (453 lines, one class, ~12 responsibilities). Inventory of what it actually does each frame:

| # | Responsibility | Where in the file | Reads | Writes |
|---|---|---|---|---|
| 1 | Build inputs for the hierarchy resolver (Transform → degrees/radians convert, fold `parent`) | `buildResolvedTransforms` L114-156 | World: every `Transform` | nothing in ECS; produces a `Map<EntityId, ResolvedTransform>` per frame |
| 2 | Pick the active camera entity (`Camera.active === true`, else first) | `refreshCamera` L211-249 | World: `Camera` | adapter-internal `this.camera` + `this.cameraEntityId` |
| 3 | Reconcile camera params (fov/near/far/aspect) onto the Three.js `PerspectiveCamera` | same | `Camera` | Three.js object |
| 4 | Apply resolver world-transform to the camera object | same | resolved map | Three.js camera transform |
| 5 | Mesh lifecycle add/remove diff against the World's `MeshRenderer` set | `refreshMeshes` L251-303 | World: `MeshRenderer` | `meshes` Map; `appliedMaterials` / `appliedGeometries` Maps; scene-graph `add`/`remove` |
| 6 | Build initial geometry (primitive vs placeholder for `.glb`) | `refreshMeshes` + `createPrimitiveGeometry` L412 | `MeshRenderer.mesh` | new `BoxGeometry`/`SphereGeometry`/`PlaneGeometry` |
| 7 | Initial material (StandardMaterial w/ color) | `refreshMeshes` | `MeshRenderer.color` | `MeshStandardMaterial` |
| 8 | Async `.glb` mesh fetch + swap | `maybeLoadGeometry` L305-334 | `AssetRegistry` | `mesh.geometry` (mutates Three.js) + `appliedGeometries` |
| 9 | Async material manifest fetch + apply (color, roughness, metalness, emissive) | `maybeApplyMaterial` L336-372 | `AssetRegistry` | `mesh.material` + `appliedMaterials` |
| 10 | Apply resolver world-transform to each mesh | `refreshMeshes` L301 | resolved map | Three.js mesh transform |
| 11 | Call `renderer.render(scene, camera)` (WebGL draw) | `render` L99-107 | scene-graph + GL device | GPU |
| 12 | Asset HMR invalidation (forget cached bindings so they reload) | `forgetAssetBinding` L188-199 | none | `appliedMaterials` / `appliedGeometries` Maps |
| + | Dispose path (clear meshes, dispose GL device) | `dispose` L201-209 | own state | GPU resources |

### What's wrong with one-class

- **Mixed sources of truth.** The "what's renderable" set lives partly in `World.query(["MeshRenderer"])` and partly in `this.meshes`. A future system that wants to read "current mesh handles" (debug overlay, picking, batching) has no ECS-visible answer.
- **Per-frame allocation in #1.** `buildResolvedTransforms` walks every Transform-bearing entity and builds a fresh `TransformInput[]` + `Map<EntityId, ResolvedTransform>` each frame, with degree→radian conversion inline. `M22 / M16-cache` literally exists to replace this with a `LocalToWorld` component cache. The pass is a `TransformResolveSystem` waiting to happen.
- **Async asset reads inside a "render" call.** `maybeLoadGeometry` / `maybeApplyMaterial` fire promises mid-frame. Cancellation guard is the `appliedGeometries` map; this is fine but it's invisible to any test/observer outside the class. A `MaterialBindingSystem` with explicit "pending refs" component makes the lifecycle queryable.
- **No insertion points for `M17` batching.** Batching needs to (a) read `MeshRenderer + Transform`, (b) group by `mesh+material+policy`, (c) maintain `InstancedMesh` buckets, (d) feed transform updates per bucket. Today there's no place to slot that without either subclassing `ThreeRenderer` or threading new methods through it.
- **Hard to benchmark.** `M22 / ECS-B*` will produce per-system timings via the scheduler; a renderer that is one `render()` call gives one number with no decomposition.

### What's *right* about it that we should preserve

- **Renderer-import-boundary.** `engine/core` never imports `three`. Only `engine/render/three-renderer.ts` and `engine/render/glb-loader.ts` do. Verified: `grep -rn "from \"three\"" engine/` returns those two files. The split must keep `core` Three.js-free.
- **Adapter-owned Three.js scene-graph root.** `Scene`, ambient/directional lights, `WebGLRenderer` device. These are legitimate "third-party API demanding an opaque cache" — the `CLAUDE.md` deviation rationale fits perfectly.
- **Async cancellation via "last-set ref" check.** `if (this.appliedGeometries.get(entityId) !== meshRef) return;` is the right pattern for racing fetches against scene mutation. We keep it; we just expose it as a component instead of a private Map.
- **Hierarchy fallback on resolver throw.** `try/catch` around `resolveHierarchy` returning identity-per-entity so the renderer doesn't crash during HMR. Migrate as-is; it lives in the `TransformResolveSystem`.

## 3. Proposed split

Target: five scheduler-registered `frameUpdate` systems + one thin adapter that owns the GL device + scene graph root.

```text
SystemScheduler.frameUpdate (in registration order, every frame):

  1. TransformResolveSystem
       reads:  Transform (every entity)
       writes: LocalToWorld component (per entity, dirty-flagged later in M22)
       notes:  this is the M22 / M16-cache pivot. Investigation-only here;
               story M21-a ships the system but keeps per-frame full rebuild
               until M22 LocalToWorld cache lands.

  2. CameraSyncSystem
       reads:  Camera, LocalToWorld
       writes: ActiveCamera (singleton component on the picked entity)
               + adapter-side PerspectiveCamera (kept in adapter state because
               Three.js needs the live object reference at draw time)
       notes:  the "first Camera if none active" fallback moves out of the
               renderer class into this system's policy.

  3. MeshLifecycleSystem
       reads:  MeshRenderer (presence diff)
       writes: RenderMeshHandle (internal component: opaque handle id;
               pairs to adapter-side Map<HandleId, Three.Mesh>)
       notes:  add/remove only. No transform writes here. Geometry choice
               (primitive vs placeholder) belongs to MaterialBindingSystem
               so this system is mesh-set-membership only.

  4. MaterialBindingSystem  (covers both geometry + material refs)
       reads:  MeshRenderer.mesh, MeshRenderer.material, MeshRenderer.color,
               AssetRegistry
       writes: AppliedGeometryRef, AppliedMaterialRef components
               (last-applied ref, mirrors the current private Maps but as
               typed ECS data the agent can inspect via window.__agf.snapshot()).
       notes:  async asset.get() stays here. Cancellation = compare current
               AppliedRef with target ref before applying.

  5. MeshTransformSyncSystem
       reads:  RenderMeshHandle + LocalToWorld
       writes: adapter Three.js mesh.position/rotation/scale
       notes:  this is the per-frame hottest pass. M17 batching will later
               replace it with a BucketTransformSyncSystem for batched
               entities; un-batched entities keep going through this system.

(adapter — not a System, called explicitly from start.ts after the scheduler frame:)
  6. ThreeRenderAdapter.draw()
       reads:  adapter-side scene + ActiveCamera adapter ref
       writes: GPU
       notes:  one line: this.renderer.render(this.scene, this.activeCamera).
               No ECS access. Single legitimate "third-party API" point.
```

### Component additions

All new components are renderer-internal — emitted by these systems, not authored in scene JSON. They're omitted from `persistence.components` allowlists and from the default `engine inspect` output unless a `--include-render-internals` flag is passed.

| Component | Shape | Owner |
|---|---|---|
| `LocalToWorld` | `{ position: [n,n,n]; rotation: [n,n,n]; scale: [n,n,n] }` (radians) | `TransformResolveSystem` writes; many systems read |
| `RenderMeshHandle` | `{ id: number }` (opaque adapter key) | `MeshLifecycleSystem` writes; `MaterialBindingSystem` + `MeshTransformSyncSystem` read |
| `AppliedGeometryRef` | `{ ref: string; status: "pending" \| "applied" \| "failed" }` | `MaterialBindingSystem` |
| `AppliedMaterialRef` | same shape as above | `MaterialBindingSystem` |
| `ActiveCamera` | `{}` (marker) | `CameraSyncSystem` (added/removed when active swaps) |

**Why internal components instead of adapter-private Maps?** Three reasons:

1. **Agent-visible state.** `window.__agf.snapshot()` already serialises components. With `--include-render-internals`, an agent debugging "why doesn't this mesh show" sees `AppliedGeometryRef.status = "pending"` or `"failed"`, no need to read renderer-class internals.
2. **HMR friendliness.** Asset invalidation today is the special `forgetAssetBinding(ref)` method. With component data, the same effect is `commands: entity.removeComponent("AppliedGeometryRef")` which the standard command pipeline handles.
3. **Batching prerequisite.** `M17 BatchingSystem` needs to *replace* `RenderMeshHandle` with a `BatchedMeshHandle` for batched entities. Having both as ECS components means the swap is a `commands.applyCommands` away, not a renderer-class API change.

### What stays in the adapter

```text
class ThreeRenderAdapter {
  private readonly scene: Scene;                          // Three.js root
  private readonly device: WebGLRenderer;                 // GL device
  private readonly meshes = new Map<HandleId, Mesh>();    // handle resolution
  private readonly cameras = new Map<EntityId, PerspectiveCamera>();
  private activeCamera: PerspectiveCamera | undefined;

  // Used by systems through a narrow interface:
  acquireMesh(initial: { geometry: PrimitiveName | "placeholder" }): HandleId
  releaseMesh(id: HandleId): void
  setMeshGeometry(id: HandleId, geom: BufferGeometry): void
  setMeshMaterial(id: HandleId, patch: MaterialPatch): void
  setMeshTransform(id: HandleId, world: ResolvedTransform): void
  setActiveCamera(entityId: EntityId, params: CameraComponent): void
  draw(): void
  resize(w: number, h: number): void
  dispose(): void
  info(): RendererInfo
}
```

The adapter is dumb. It does not query the World. Systems mediate every World ↔ Three.js touch.

## 4. Renderer-import-boundary preservation

After the split, the `engine/render/` tree contains:

```
engine/render/
  three-render-adapter.ts        # Three.js touchpoint (was three-renderer.ts)
  systems/
    transform-resolve-system.ts
    camera-sync-system.ts
    mesh-lifecycle-system.ts
    material-binding-system.ts
    mesh-transform-sync-system.ts
  glb-loader.ts
```

The new systems live under `engine/render/systems/`, not `engine/core/systems/`. Reason: they import `ThreeRenderAdapter` to do their writes. Putting them under `core/` would force the adapter to be passed through `SystemContext`, which contaminates `core`. Keeping them under `render/` preserves the existing rule (`core` Three.js-free) and matches the dependency graph.

New `engine check` rule (story `M21-boundary-check`): error if any file under `engine/core/` imports from `engine/render/` or from `three`.

## 5. Risks and non-goals

### Risks

- **Two-writer regression on Transform.** Today, `SpinSystem` writes `Transform.rotation` and the renderer reads it the same frame. With `LocalToWorld` interposed, a system that mutates `Transform` after `TransformResolveSystem` runs will not see its change reflected until next frame. *Mitigation:* `TransformResolveSystem` runs in `frameUpdate`, after fixedUpdate gameplay systems. Document the ordering rule. (`M22 / M16-cache` later adds dirty-flagging so re-runs are cheap.)
- **Frame-perfect HMR.** Asset HMR currently invalidates renderer maps synchronously via `forgetAssetBinding`. The new path is "command pipeline removes `AppliedMaterialRef`; next frame `MaterialBindingSystem` re-fetches". One-frame delay, acceptable in practice (no automated test asserts within-frame reload).
- **Extra component allocations.** Five new components per renderable entity is non-zero allocation. *Mitigation:* `M22 / ECS-B*` benchmark suite measures the delta before and after; any regression > 5% at 1k entities is a release-blocker on the story.
- **Adapter Mesh handle leak.** If `MeshLifecycleSystem` removes a `RenderMeshHandle` component but never calls `adapter.releaseMesh`, the Three.js mesh leaks. *Mitigation:* `engine doctor` adds a `renderer-handle-leak` check that compares World handles vs adapter map size and fails on mismatch.

### Non-goals for `M21`

- **Not** rewriting to archetype ECS — that's `M22 / Friflo-style`, not this epic.
- **Not** implementing `M17` batching — this epic produces the *seams* batching will use.
- **Not** introducing a render graph / pass abstraction. Single forward draw, single camera, no post-processing yet. When post-processing arrives, it gets its own system (`PostProcessSystem`) inserted after `MeshTransformSyncSystem`.
- **Not** moving lights to ECS. `AmbientLight` + `DirectionalLight` are scene-graph fixtures in the adapter. They become ECS later when "edit a light in the scene" becomes a story.

## 6. Measurement plan (must be green before merging M21)

Gated on `M22 / ECS-B1..B3` (benchmark harness) landing first. Then for `M21`:

- **Frame-time at 1k entities** with the dogfood `examples/hello-3d` blown up to 1000 boxes (use the `examples/batch-bench/` perf project added in Sprint 32 once it exists).
  - Baseline: current monolithic `render()` time.
  - Target: split sum-of-systems ≤ baseline × 1.05.
  - Fail-loud if any individual system exceeds 0.5 ms at 1k.
- **Per-system breakdown** logged via the existing diagnostics bus (`runtime.diagnostics.emit({ type: "system.timing", … })`). Available as SSE via `M15-g`.
- **Renderer info parity.** `info()` numbers (geometries, textures, programs, drawCalls, triangles, meshes) must match exactly before/after for the same scene.
- **Snapshot determinism.** `window.__agf.snapshot()` output (default flags) is byte-identical before/after. Internal components are gated behind `--include-render-internals`.

## 7. Story breakdown (queueable for Sprint 33+)

Sized for one sprint slot each.

- `M21-a` Land `ThreeRenderAdapter` with the narrow interface from §3. `ThreeRenderer` becomes a deprecation-shim that constructs an adapter + registers the five systems. Renderer-import-boundary unchanged.
- `M21-b` Introduce `LocalToWorld` component + `TransformResolveSystem`. Renderer reads `LocalToWorld` instead of recomputing inline. Spinner / Beacon e2e green.
- `M21-c` `CameraSyncSystem` + `ActiveCamera` marker. Move "pick active camera" policy out of the renderer.
- `M21-d` `MeshLifecycleSystem` + `RenderMeshHandle`. Renderer no longer queries the World for mesh set; `meshes` Map becomes adapter-only handle resolution.
- `M21-e` `MaterialBindingSystem` + `AppliedGeometryRef` / `AppliedMaterialRef`. Async load + cancellation moves into the system. `invalidateAsset` becomes a command pipeline call.
- `M21-f` `MeshTransformSyncSystem`. Writes Three.js transforms only; renderer transform-write code paths deleted.
- `M21-g` Snapshot `--include-render-internals` flag + `engine doctor` `renderer-handle-leak` check.
- `M21-boundary-check` Update `engine check` to error on `core → render` or `core → three` imports.

`M17` batching epic plugs into the seam created by `M21-d`/`M21-f`: a `BatchingSystem` runs *between* `MaterialBindingSystem` and `MeshTransformSyncSystem`, swaps `RenderMeshHandle` for `BatchedMeshHandle` on entities tagged `Batchable`, and the existing `MeshTransformSyncSystem` skips those.

## 8. Decision

Recommend proceeding with the split as sequenced in §7. The per-step ordering is intentionally conservative — at every story boundary the engine still runs end-to-end, only the implementation detail behind the rendered output changes. Each story is independently shippable and reversible.

The split is *not* an architecture rewrite. The adapter still owns the GL device; the resolver still computes world transforms; the asset registry still loads materials. What changes is *where the orchestration lives* — five named, schedulable, measurable systems instead of one 453-line class.
