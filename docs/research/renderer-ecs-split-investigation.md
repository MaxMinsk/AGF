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

### Non-goals for *Phase 1 / `M21-a..h`* (the minimum split)

- **Not** rewriting to archetype ECS — that's `M22 / Friflo-style`, not this epic.
- **Not** implementing `M17` batching code — Phase 1 produces the *seams* batching will use; batching ships in Phase 2.
- **Not** introducing a render graph / pass abstraction. Single forward draw, single camera. Phase 2 adds `PostProcessSystem`.
- **Not** moving lights to ECS in Phase 1. The two hard-coded `AmbientLight` + `DirectionalLight` stay as adapter scene-graph fixtures until Phase 2 (`M21-light-*`).
- **Not** changing material taxonomy in Phase 1. Still only `MeshStandardMaterial` with the existing manifest shape. Phase 2 adds physical / unlit / custom shader paths.

Everything in the §7 story queue is Phase 1. Phase 2 (§8 onward) builds on top of the same five-system seam.

## 6. Measurement plan (must be green before merging M21)

Gated on `M22 / ECS-B1..B3` (benchmark harness) landing first. Then for `M21`:

- **Frame-time at 1k entities** with the dogfood `examples/hello-3d` blown up to 1000 boxes (use the `examples/batch-bench/` perf project added in Sprint 32 once it exists).
  - Baseline: current monolithic `render()` time.
  - Target: split sum-of-systems ≤ baseline × 1.05.
  - Fail-loud if any individual system exceeds 0.5 ms at 1k.
- **Per-system breakdown** logged via the existing diagnostics bus (`runtime.diagnostics.emit({ type: "system.timing", … })`). Available as SSE via `M15-g`.
- **Renderer info parity.** `info()` numbers (geometries, textures, programs, drawCalls, triangles, meshes) must match exactly before/after for the same scene.
- **Snapshot determinism.** `window.__agf.snapshot()` output (default flags) is byte-identical before/after. Internal components are gated behind `--include-render-internals`.

## 7. Phase 1 story breakdown — minimum split

Sized for one sprint slot each.

- `M21-a` Land `ThreeRenderAdapter` with the narrow interface from §3. `ThreeRenderer` becomes a deprecation-shim that constructs an adapter + registers the five systems. Renderer-import-boundary unchanged.
- `M21-b` Introduce `LocalToWorld` component + `TransformResolveSystem`. Renderer reads `LocalToWorld` instead of recomputing inline. Spinner / Beacon e2e green.
- `M21-c` `CameraSyncSystem` + `ActiveCamera` marker. Move "pick active camera" policy out of the renderer.
- `M21-d` `MeshLifecycleSystem` + `RenderMeshHandle`. Renderer no longer queries the World for mesh set; `meshes` Map becomes adapter-only handle resolution.
- `M21-e` `MaterialBindingSystem` + `AppliedGeometryRef` / `AppliedMaterialRef`. Async load + cancellation moves into the system. `invalidateAsset` becomes a command pipeline call.
- `M21-f` `MeshTransformSyncSystem`. Writes Three.js transforms only; renderer transform-write code paths deleted.
- `M21-g` Snapshot `--include-render-internals` flag + `engine doctor` `renderer-handle-leak` check.
- `M21-boundary-check` Update `engine check` to error on `core → render` or `core → three` imports.

End of Phase 1: the renderer is five systems + a dumb adapter. *Visible* output identical to today; what changes is everything underneath. Phase 2 starts using the seam.

---

## 8. Phase 2 — "Unity-class" feature target

Phase 1 only buys structure. The user-facing goal — "almost Unity-class" — means the renderer eventually covers materials beyond `MeshStandardMaterial`, real lighting, real shadows, batching that scales to thousands of dynamic objects, post-processing, IBL/envmaps, tonemapping, multiple cameras. Each capability is its own epic; this section sequences them and shows how they slot into the five-system seam without re-architecting.

**Principles that apply to every Phase 2 milestone:**

1. **Schema-first.** Every new renderer concept (material kind, light type, shadow params, batching tag, post-pass list) lands as JSON Schema first, components second, system third, adapter calls last. An agent edits `*.material.json` / `*.scene.json`, never C++/Three.js code.
2. **ECS-first, with documented deviations.** Lights are components. Cameras are components. Shadow casters are tags. Anything sitting in `adapter.scene` that's not addressable from the World is a documented deviation in line with `CLAUDE.md`.
3. **Cost-gated.** Each milestone adds benchmarks to `examples/batch-bench/` measuring its own overhead. Going green = ship.
4. **Agent-inspectable.** `info()` grows per-feature counters (`shadowMaps: 2, postPasses: 3, batches: 7`). `engine doctor` grows checks specific to each milestone.

### 8.1 Materials & shaders (`M21-mat-*`)

Today there's one material path: `MeshStandardMaterial` with `{color, roughness, metalness, emissive}` from `MaterialManifest`. Unity-class needs five.

Reference: `References/three.js/examples/webgl_materials_physical_clearcoat.html`, `webgl_materials_physical_transmission.html`, `webgl_materials_modified.html`, `webgl_shader.html`, `webgl_materials_envmaps_hdr.html`.

**Material kinds we want:**

| Kind | Three.js class | Manifest example fields | Use case |
|---|---|---|---|
| `standard` | `MeshStandardMaterial` | color, roughness, metalness, emissive, normalMap, aoMap | PBR default. (Already exists.) |
| `physical` | `MeshPhysicalMaterial` | + clearcoat, sheen, transmission, ior, iridescence, thickness | Hero objects (cars, glass, fabric). |
| `unlit` | `MeshBasicMaterial` | color, map, opacity | UI billboards, particles, debug. |
| `lambert` / `phong` | `MeshLambertMaterial` / `MeshPhongMaterial` | color, emissive, specular (phong) | Stylised / low-cost paths. |
| `custom` | `ShaderMaterial` (or `onBeforeCompile` patch on standard) | `vertexShader` / `fragmentShader` ref, `uniforms` map | Effects, water, foliage, sky. |

**Schema additions** (`materials/*.material.json`):

```json
{
  "kind": "physical",
  "color": "#a3c9ff",
  "roughness": 0.18,
  "metalness": 0.0,
  "clearcoat": 1.0,
  "clearcoatRoughness": 0.05,
  "ior": 1.45,
  "transmission": 0.6,
  "thickness": 1.0,
  "textures": {
    "map": "runtime/textures/lacquer-albedo.ktx2",
    "normalMap": "runtime/textures/lacquer-normal.ktx2",
    "roughnessMap": "runtime/textures/lacquer-roughness.ktx2"
  }
}
```

```json
{
  "kind": "custom",
  "vertexShader": "shaders/water.vert.glsl",
  "fragmentShader": "shaders/water.frag.glsl",
  "uniforms": {
    "uTime": { "type": "float", "value": 0 },
    "uColor": { "type": "color", "value": "#1a4d6f" }
  },
  "lights": true,
  "transparent": true
}
```

**ECS surface:** `MeshRenderer.material` still points at a manifest ref. `MaterialBindingSystem` dispatches on `kind` to build the right Three.js material class, then patches uniforms / textures. New internal component: `MaterialKind` (`{ kind: "standard" | "physical" | "unlit" | "lambert" | "phong" | "custom" }`) so the bucketer in §8.4 can group correctly.

**Shader pipeline:**

- Author GLSL in `examples/<project>/shaders/*.glsl`. Existing shader spike from Sprint 2 already validates load + manifest pairing.
- Schema validation rejects unknown uniform types.
- Hot reload re-compiles via `ShaderMaterial.needsUpdate = true` on the affected entities (HMR already handles asset invalidation).
- **Shader warmup**: a `ShaderWarmupSystem` runs once on scene load, instantiates each unique material × geometry combo offscreen, forces a `renderer.compile(scene, camera)`. Prevents the first-frame stutter when a new material enters view. Reference: standard Three.js `renderer.compile()` API.
- **`onBeforeCompile` extension hook** for the `extends: "standard"` material kind — author specifies a manifest with a `replaces: { fragmentChunk: "…", shaderInjection: "…" }` block, system patches the standard material chunks. Reference: `webgl_materials_modified.html`.

**Cost gate:** material kind switch cost is paid at `MaterialBindingSystem` time, not draw time. New material classes shouldn't change per-frame timing for unchanged scenes.

**Stories:**

- `M21-mat-physical` Add `kind: physical` path + manifest schema + `MeshPhysicalMaterial` binding.
- `M21-mat-unlit` Add `unlit` / `lambert` / `phong` kinds.
- `M21-mat-shader` Add `custom` kind (`ShaderMaterial`). Shader file pairing via existing shader loader.
- `M21-mat-onbeforecompile` `extends: standard` patch path with chunk replacement.
- `M21-mat-warmup` `ShaderWarmupSystem` + scene-load gate.
- `M21-mat-textures` PBR texture maps (`map`, `normalMap`, `roughnessMap`, `metalnessMap`, `aoMap`, `emissiveMap`). Texture loader + `KTX2Loader` for compressed.

### 8.2 Lighting

Today: hard-coded `AmbientLight(0xffffff, 0.6)` + one `DirectionalLight(0xffffff, 0.85)` at `(5, 10, 7)` in `ThreeRenderer` constructor. Unity-class needs lights as ECS components.

Reference: `webgl_lights_physical.html`, `webgl_lights_spotlight.html`, `webgl_lights_hemisphere.html`, `webgl_lights_rectarealight.html`, `webgl_lightprobes.html`.

**Light component shape** (single `Light` component, polymorphic by `kind`):

```json
{
  "Light": {
    "kind": "directional",
    "color": "#fff8e7",
    "intensity": 2.0,
    "castShadow": true,
    "target": { "entityId": "world.origin" }
  }
}
```

```json
{ "Light": { "kind": "point", "color": "#ffcc88", "intensity": 8.0, "distance": 15, "decay": 2 } }
```

```json
{ "Light": { "kind": "spot", "color": "#ffffff", "intensity": 12, "angle": 0.42, "penumbra": 0.3, "distance": 20 } }
```

Kinds: `directional`, `point`, `spot`, `ambient`, `hemisphere`, `rect-area`.

**ECS surface:** new system `LightLifecycleSystem` (runs between camera-sync and mesh-lifecycle) reads `Light + Transform`, creates/destroys Three.js `Light` instances in the adapter's `lights: Map<EntityId, THREE.Light>`. A second `LightSyncSystem` (after `TransformResolveSystem`) pushes `LocalToWorld` to each light's `position` / `target` per frame.

The adapter grows: `acquireLight(kind)`, `releaseLight(id)`, `setLightParams(id, patch)`, `setLightTransform(id, world, target?)`.

**`RectAreaLight`** needs the LUT init (`RectAreaLightUniformsLib.init()`) — runs once at adapter construction.

**`HemisphereLight`** is the cheap stand-in for "sky + ground" outdoor scenes — useful for stylised projects without IBL.

**Default scene lighting:** if a scene declares zero `Light` components, the adapter inserts a fallback ambient + directional (matches today's behaviour) and emits `runtime.diagnostics.warn({ code: "AGF_NO_LIGHTS" })`. Once scenes have explicit lights, the fallback disappears.

**Stories:**

- `M21-light-schema` Add `Light` component to `schemas/components/`. JSON Schema with `kind` discriminator.
- `M21-light-directional-point` `LightLifecycleSystem` + `LightSyncSystem`, directional + point + ambient.
- `M21-light-spot-hemisphere-rect` Spot + hemisphere + rect-area kinds. RectAreaLight LUT init.
- `M21-light-fallback` `AGF_NO_LIGHTS` diagnostic + default scene lighting.

### 8.3 Shadows

Today: no shadows. `renderer.shadowMap.enabled` is false.

Reference: `webgl_shadowmap.html`, `webgl_shadowmap_csm.html` (Cascaded Shadow Maps for outdoor), `webgl_shadowmap_pcss.html` (soft contact shadows), `webgl_shadowmap_vsm.html` (variance), `webgl_shadow_contact.html`.

**Three layers, opt-in per scene:**

1. **Basic shadow maps** — per-light `castShadow: true` enables a shadow map. `PCFSoftShadowMap` (best quality default; `PCFShadowMap` for perf-sensitive). Shadow params live on the `Light` component:
   ```json
   { "Light": { "kind": "directional", "castShadow": true, "shadow": { "mapSize": 2048, "bias": -0.0005, "normalBias": 0.02, "camera": { "left": -20, "right": 20, "top": 20, "bottom": -20, "near": 0.1, "far": 50 } } } }
   ```
2. **CSM (Cascaded Shadow Maps)** — addon at `three/addons/csm/CSM.js`. Required for any outdoor scene larger than ~50 m. Behind a scene-level toggle: `project.json#renderer.shadows.csm: { cascades: 4, maxFar: 200 }`. `CSMSystem` manages cascade splits per frame from the active camera.
3. **PCSS / VSM / contact** — Phase 3, not on the Phase 2 critical path. Behind `project.json#renderer.shadows.algorithm: "pcss" | "vsm"`.

**Per-mesh opt-in** via a `ShadowFlags` component:
```json
{ "ShadowFlags": { "cast": true, "receive": true } }
```
Default if absent: both true (matches Unity's default behaviour). Setting either to false is the perf escape hatch.

**ECS surface:**

- `MeshLifecycleSystem` reads `ShadowFlags` and sets `mesh.castShadow` / `mesh.receiveShadow` on the Three.js mesh.
- `LightLifecycleSystem` reads `Light.castShadow + Light.shadow` and configures the Three.js light's shadow.
- New `CSMSystem` (Phase 2 stretch) wraps the CSM addon.

**Cost gate:** shadow on adds the second pass per shadow-casting light. Benchmark: 1k entities + 1 shadow-casting directional light ≤ baseline × 1.25 (shadow pass is expected to cost; we just don't want it to balloon).

**Stories:**

- `M21-shadow-basic` Per-light `castShadow` + per-mesh `ShadowFlags`. `PCFSoftShadowMap` default.
- `M21-shadow-csm` CSM via the addon, behind `project.json#renderer.shadows.csm`.
- `M21-shadow-algorithm` Phase 3 — PCSS / VSM / contact.

### 8.4 Batching & instancing (`M17` epic, scheduled here)

Today: each `MeshRenderer` entity = one `THREE.Mesh` = one draw call. Doesn't scale past a few hundred.

Reference: `webgl_mesh_batch.html` (`BatchedMesh` — multi-geometry, multi-material via per-instance index, dynamic add/remove), `webgl_batch_lod_bvh.html` (BatchedMesh + LOD + BVH frustum culling), `webgl_instancing_performance.html` (single-geom InstancedMesh), `webgl_instancing_dynamic.html`.

**Three modes, picked by the bucketer:**

| Mode | Three.js class | Conditions | Cost |
|---|---|---|---|
| Single-mesh | `Mesh` | entity has unique geometry + material; or the bucketer can't group it | 1 draw call per entity |
| Instanced | `InstancedMesh` | bucket of entities with **identical** geometry + material; transform per-instance | 1 draw call per bucket; small per-instance overhead |
| Batched | `BatchedMesh` | bucket of entities with **different** geometries but **same** material (multi-draw) | 1 draw call per material bucket; supports per-instance color via `BatchedMesh.setColorAt` |

**`Batchable` component (authored):**

```json
{ "Batchable": { "group": "boulder-static", "lod": [{ "distance": 50, "mesh": "models/boulder-lo.glb" }] } }
```

The `group` is a hint — entities with the same `group` *try* to share a bucket. The bucketer respects it but can subdivide if the bucket exceeds `BatchedMesh`'s instance cap.

**ECS surface:**

```text
LightLifecycle    →
TransformResolve  →
CameraSync        →
MeshLifecycle     →  (writes RenderMeshHandle for non-batched only)
BatchingSystem    →  reads Batchable + MeshRenderer + LocalToWorld
                     groups by (mesh, material, MaterialKind, ShadowFlags),
                     decides InstancedMesh vs BatchedMesh vs single,
                     writes BatchedMeshHandle { bucketId, instanceId }
                     or InstancedMeshHandle { bucketId, instanceId }
                     in place of RenderMeshHandle.
MaterialBinding   →  skips entities with batched handles (bucket owns material)
MeshTransformSync →  branches: per-handle-type. For batched/instanced
                     entities, writes the per-instance matrix via
                     adapter.setBucketInstanceTransform.
```

The adapter grows: `acquireInstancedBucket(geomKey, materialKey)`, `acquireBatchedBucket(materialKey)`, `addBucketInstance(bucketId)`, `setBucketInstanceTransform(bucketId, instanceId, world)`, `setBucketInstanceColor(bucketId, instanceId, hex)`, `removeBucketInstance(bucketId, instanceId)`.

**LOD:** the `Batchable.lod` array is consumed by the `BatchingSystem`: for `BatchedMesh`, multiple geometries per instance with `setGeometryIdAt(instanceId, geomId)` driven by camera distance. Reference: `webgl_batch_lod_bvh.html`.

**Frustum culling:** `BatchedMesh` has built-in BVH support — adapter calls `bucket.computeBVH()` once per topology change. Per-frame `bucket.frustumCulled = true` skips off-screen instances.

**`engine doctor` checks:**

- `batch-overflow` — a `Batchable.group` bucket hit the `BatchedMesh` instance cap (default 256, configurable per project).
- `batch-fragmentation` — too many small buckets (more than `entities / 8`) suggests a `group` naming mistake.

**Cost gate:** at 5000 entities sharing one material:
- Baseline (Phase 1): 5000 draw calls → frame ~16 ms can't hold.
- Target with `Batchable.group`: ≤ 8 draw calls, ≤ 4 ms per-system in `BatchingSystem` + `MeshTransformSyncSystem` combined.

**Stories:** moved to `M17` epic, but sequenced here as a Phase 2 milestone:

- `M17-bucketer` `BatchingSystem` + `InstancedMeshHandle` (single-geom path only).
- `M17-batched-mesh` `BatchedMeshHandle` for multi-geom same-material buckets.
- `M17-lod` Per-instance LOD via `Batchable.lod`.
- `M17-bvh-culling` Per-bucket BVH + frustum culling.
- `M17-doctor` `engine doctor` batch-overflow / batch-fragmentation checks.

### 8.5 Post-processing

Today: no post-processing. `renderer.render(scene, camera)` direct draw.

Reference: `jsm/postprocessing/EffectComposer.js` + pass library (`UnrealBloomPass`, `SMAAPass`, `SSAOPass`, `GTAOPass`, `OutputPass`, `FXAAPass`, `BokehPass`, `OutlinePass`).

**Scene-level configuration** in `project.json` or per-scene:

```json
{
  "renderer": {
    "postProcess": [
      { "kind": "bloom", "strength": 0.8, "radius": 0.4, "threshold": 0.85 },
      { "kind": "ssao", "intensity": 1.0, "radius": 0.5 },
      { "kind": "smaa" },
      { "kind": "output" }
    ]
  }
}
```

**ECS surface:** a new `PostProcessSystem` reads the project's post-process list. Adapter owns an `EffectComposer`; system reconciles the pass chain against the configured list (add/remove/reorder). When the list is non-empty, the adapter's `draw()` calls `composer.render()` instead of the direct path.

The default `OutputPass` is mandatory when any pass is configured (handles tonemapping + color space conversion downstream of the chain). If the user omits it, the system inserts it automatically as the last pass.

**Stories:**

- `M21-post-composer` Adapter grows `EffectComposer` + `PostProcessSystem` reconciler. Bloom + Output + FXAA out of the box.
- `M21-post-ssao` SSAO/GTAO + SMAA.
- `M21-post-outline` Outline pass (great for picking/debug overlays — feeds the future inspector).

### 8.6 Color management & tonemapping

Today: no explicit color space / tonemap setup. Three.js' `WebGLRenderer` defaults work but aren't HDR-grade.

Reference: `webgl_materials_envmaps_hdr.html`, the project-wide ColorManagement setup in any modern Three.js example.

**Project-level config:**

```json
{
  "renderer": {
    "outputColorSpace": "srgb",
    "toneMapping": "aces-filmic",
    "toneMappingExposure": 1.0
  }
}
```

Tonemapping kinds: `none`, `linear`, `reinhard`, `cineon`, `aces-filmic` (recommended default), `agx` (newer / film-look), `neutral`.

**Stories:**

- `M21-color` `outputColorSpace` + tonemap + exposure passed to adapter at construction. Linked to `project.json` schema.

### 8.7 Environment / IBL (image-based lighting)

Today: no environment. PBR materials look flat without an envmap.

Reference: `webgl_materials_envmaps_hdr.html`, `webgl_materials_envmaps_groundprojected.html`, `webgl_lightprobes_sponza.html`.

**Scene-level:**

```json
{
  "environment": {
    "kind": "hdr",
    "source": "runtime/env/studio.hdr",
    "intensity": 1.0,
    "background": true,
    "backgroundBlur": 0.0
  }
}
```

Kinds: `hdr` (HDRI file via `RGBELoader` + `PMREMGenerator`), `cube` (six-face cubemap), `generated` (procedural `RoomEnvironment` — Three.js built-in studio fallback).

**ECS surface:** `EnvironmentSystem` (runs once per scene-load, then on env change) builds the `PMREMGenerator` output, assigns to `scene.environment` and optionally `scene.background`. Adapter exposes `setEnvironment(envMap, background?)`.

**Stories:**

- `M21-env-generated` `RoomEnvironment` fallback so even minimal scenes get believable PBR.
- `M21-env-hdr` HDR file loading + PMREM.
- `M21-env-cube` Six-face cubemap path.

### 8.8 Camera features

Today: one active perspective camera; no layers, no render targets, no orthographic.

**Add (small):**

- `kind: "orthographic"` already half-declared in the type; finish it. `Camera.size` for orthographic frustum.
- `Camera.layers: number[]` — Three.js layer mask. Lets the inspector overlay render on its own layer.
- `Camera.renderTarget: { ref: "runtime/rt/minimap.rt.json" }` — offscreen render targets for minimap / portal / preview thumbnails. Same `CameraSyncSystem` handles them.
- Multi-camera ordering: `Camera.priority: number` — adapter draws in priority order, with the highest-priority "main camera" going to the canvas and others to render targets.

**Stories:**

- `M21-cam-ortho` Orthographic kind.
- `M21-cam-layers` Layer mask plumbing.
- `M21-cam-rt` Offscreen render targets.

### 8.9 Phase 2 sequencing

Not all of §8 ships in one sprint. Order by "what unlocks the most visible improvement per story" and by dependency:

1. **Sprint 33–34 — Phase 1 finish** (`M21-a..h`).
2. **Sprint 35** — `M21-light-schema` + `M21-light-directional-point` + `M21-shadow-basic` + `M21-env-generated`. Lights and basic shadows + the procedural studio IBL transform a flat scene into something that looks like a game. Highest visible delta per sprint.
3. **Sprint 36** — `M17-bucketer` + `M17-batched-mesh` + `M21-shadow-csm`. Performance pass (batching unlocks 1k+ entities) and CSM (outdoor scenes get real long-distance shadows).
4. **Sprint 37** — `M21-mat-physical` + `M21-mat-textures` + `M21-color` + `M21-env-hdr`. PBR vertical for hero assets, real HDR env, ACES tonemap.
5. **Sprint 38** — `M21-post-composer` + `M21-post-ssao`. Bloom + AA + SSAO.
6. **Sprint 39+** — remaining material kinds, render targets, layers, custom shaders, post-process outline, doctor checks for everything.

Each milestone is a one-PR drop with: schema diff, system file, adapter delta, benchmark report, one screenshot in `examples/batch-bench/` or `examples/feature-lab/`.

### 8.10 What "Unity-class" deliberately does *not* include

We're an agent-first web engine, not a AAA editor. Out of scope even at Phase 2 end:

- **Real-time GI / Lightmapper / Lumen-style.** No baked GI in v1; use HDR envmap + AO. Re-evaluate after `examples/feature-lab/` shows the gap.
- **Forward+ / clustered lighting.** Three.js forward path is fine up to ~10 dynamic lights; clustered is a renderer-rewrite epic, not in this scope.
- **Skinned mesh / animation system.** That's an `M23`-class animation epic, separate from rendering.
- **Volumetric fog / clouds.** Phase 3 candidate behind `RoomEnvironment`-style preset.
- **Ray tracing.** WebGL doesn't have it; WebGPU compute path is a different epic.
- **A scene editor.** `CLAUDE.md` agent-first rule — human GUI editors are low priority. Materials are JSON, lights are JSON, shaders are GLSL files.

The line we're drawing: *anything an agent can author in JSON or GLSL and validate via `engine check` is in scope; anything that needs a 3D viewport mouse-drag is not*.

## 9. Decision

Recommend proceeding with Phase 1 (§7) immediately as it's a structural refactor with no visible regression. Phase 2 (§8) is a 5-7 sprint multi-epic; each milestone is independently shippable and gated on its own benchmark.

The split is *not* an architecture rewrite. The adapter still owns the GL device; the resolver still computes world transforms; the asset registry still loads materials. What changes is *where the orchestration lives* — five named, schedulable, measurable systems instead of one 453-line class — and the seam this creates is what lets Phase 2 add Unity-class features as more systems rather than as more renderer-class methods.
