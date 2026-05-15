# Build a Game in AGF

This is the **one-page contract** for an agent that needs to assemble a small game on AGF. It points at the right tools and conventions so you don't re-discover the loop every session.

Companion reading: [`iteration-loop.md`](iteration-loop.md), [`debug-protocol.md`](debug-protocol.md), [`rules.md`](rules.md), [`asset-pipeline.md`](asset-pipeline.md). When in doubt, those win.

## Mental Model

```
project JSON  ──►  schemas  ──►  ECS world  ──►  systems  ──►  renderer / physics / network adapters
        ▲                                                         │
        └────────────── engine check / inspect / doctor  ◄────────┘
```

You author **data** (JSON) and **systems** (TypeScript). Adapters (Three.js, Rapier, the Node backend) live behind interfaces so gameplay code never touches a `THREE.Mesh` or a Rapier rigid body directly.

The shipped example projects are `hello-3d` (minimum renderer), `beacon-world` (dogfood solo + multiplayer game), `batch-bench` / `shadows-bench` (renderer perf scenes), `physics-bench` (Rapier scene), and `material-bench` (PBR + HDR + transmission showcase). Pick the closest one as a template, copy with `engine new`, and edit.

## Loop

For every change:

1. **Discover.** What components / scenes / assets already exist?
   - `npm run engine:list -- components examples/<project>` — built-ins + project-local catalog.
   - `npm run engine:explain -- component <Name>` — fields, required flags, an authoring example.
   - Skim `engine/core/systems/` and `schemas/components/` before scaffolding new ones — if `Spin` rotates a parent around Y, don't author `GroupRotator`.
2. **Edit.** JSON or TypeScript. Never adapter internals.
3. **Validate.** `npm run engine:check -- examples/<project>`. Treat warnings as TODOs.
4. **Type-check.** `npm run typecheck`.
5. **Inspect.** `npm run engine:inspect -- examples/<project>` for ECS state, optionally with `--component`, `--entity`, `--watch`, `--json`.
6. **Run.** `npm run dev` and open `/?project=<id>` — confirm the change is visible.
7. **Diagnose.** `curl http://localhost:5173/__agf/bug-report` for a snapshot + diagnostics dump. `npm run engine:doctor -- examples/<project>` for the static health check (batching, shadows, textures, prefabs).
8. **Playtest.** Scripted scenarios live under `examples/<project>/playtests/`. Add or update one when you change a gameplay mechanic.

## Walkthrough — drop a CC0 asset and render it on a sphere

End-to-end example that exercises the asset pipeline shipped in S54:

1. **Source.** Drop the file under `examples/<project>/assets/_sources/`.
2. **Record provenance.** Append an entry to `examples/<project>/assets/_sources/asset-sources.json` with `id`, `kind` (`model` / `texture` / `material` / `procedural`), `runtimeFiles`, `license`, `source.type` (`cc0` / `original` / `licensed` / `generated` / `procedural`).
3. **Optimise mesh.** `npm run engine:asset -- optimize examples/<project>` runs `@gltf-transform/functions` (dedup → prune → weld → meshopt). Use `--source <path>` to target one file; use `--textures` to additionally run WebP texture compression.
4. **Author the material manifest** under `runtime/materials/<id>.material.json`. Choose the smallest shader that paints what you want — `standard` (cheap PBR), `physical` (clearcoat / transmission / sheen / iridescence), `lambert` / `phong` (cheap diffuse / specular), `basic` (unlit). Reference textures with project-relative paths (`runtime/textures/foo.jpg`); the runtime resolves them through the asset registry.
5. **Reference from a `MeshRenderer`** with the **full manifest path**, not the `id`:
   ```json
   "MeshRenderer": { "mesh": "sphere", "material": "runtime/materials/m1-brick.material.json" }
   ```
6. **Verify.** `engine check` flags missing texture files; `engine doctor` flags huge (>1 MB) or non-power-of-two textures.

See [`asset-pipeline.md`](asset-pipeline.md) for the schema + format details.

## Common Recipes

### Add a new entity to a scene

1. `npm run engine:list -- components examples/<project>` — confirm the components you want already exist.
2. Edit `examples/<project>/scenes/<scene>.scene.json`, append an entry to `entities`.
3. `npm run engine:check -- examples/<project>` — schema errors come back with `severity`, `code`, `file`, `path`, `message`, `suggestion`.

### Instantiate a prefab instead of inlining a repeated entity

1. Declare a manifest at `examples/<project>/prefabs/<id>.prefab.json` (kebab-case id, components map; see `schemas/prefab.schema.json`).
2. In the scene, add to a sibling `instances` array — NOT `entities`:
   ```json
   "instances": [
     { "id": "core.north", "prefab": "energy-core",
       "overrides": { "Transform": { "position": [-1.5, 0.4, -2.5] } } }
   ]
   ```
3. **Overrides merge shallow** per top-level component — they replace fields you set, keep the prefab defaults for the rest.
4. `engine check` validates that every `instances[].prefab` ref resolves to a declared prefab (`AGF_SCENE_INSTANCE_PREFAB_MISSING`) and that instance ids don't collide with existing entity ids (`AGF_SCENE_INSTANCE_DUPLICATE_ID`).
5. `engine doctor` Prefabs section reports declared / used / unused / missing-ref counts. See [`skills/prefab-authoring.md`](skills/prefab-authoring.md).

### Start a brand-new project

```
npm run engine:new -- my-game --template hello-3d
```

The CLI copies the template tree, rewrites `project.json` / `template.json` for the new id, and runs `engine check` on the result.

### Add a project-local component

1. Declare it in `examples/<project>/schemas/scene-extensions.schema.json` (JSON Schema; one `components.<Name>` definition).
2. Use it in scenes — it will surface in `engine list components <projectDir>`.
3. Build a `System` that reads/writes the component. Register the system via the project's `bootstrap.ts` → `registerSystems`.

### Wire a custom system

- Reuse before writing new. Grep `engine/core/systems/` first.
- Use scheduler-registered systems (`fixedUpdate` or `frameUpdate`).
- Cache `world.createQuery(...)` handles. Raw `world.query()` in hot paths is a CI failure (`systems:check`).
- Read ECS data, write ECS data. Don't store Three.js or Rapier objects in components — adapters are stateful but invisible to gameplay.
- See [`skills/system-authoring.md`](skills/system-authoring.md).

### Show the HDR as the background

Scene-level environment with `asBackground` + optional blur:

```json
"environment": {
  "kind": "hdr",
  "url": "runtime/hdr/venice_sunset_1k.hdr",
  "intensity": 1.0,
  "asBackground": true,
  "backgroundBlurriness": 0.35
}
```

The renderer reads the HDR once through `PMREMGenerator` for IBL, and (when `asBackground`) re-binds the raw equirect texture as `scene.background` with optional blurriness.

### Cut draw calls with auto-batch

The renderer batches built-in primitives (`box`, `sphere`, `cylinder`, `plane`) into one `InstancedMesh` per (mesh + material profile + shadow flags + group). Per-instance color goes into an `InstancedBufferAttribute`, so entities with different colors still share a bucket. External meshes (`.glb`) and texture-less material manifests batch the same way once `AssetRegistry` has loaded the geometry. Default is **on** since S53; set `"batching": { "auto": false }` to opt out.

- **Per-entity opt-out** with `Batchable: { enabled: false }`.
- **Force a split** with `Batchable: { group: "rocks" }`.
- **BVH-augmented path** for large scenes: `"batching": { "path": "batched-bvh" }` builds an internal BVH over instance bounding boxes; flips the perf crossover for scenes with many off-screen instances.
- **Verify** with `npm run engine:doctor -- examples/<project>`: the `Batching:` section shows `auto`, `path`, primitive / external entity counts, and how many draw calls collapsed. Recommendations fire when auto is explicitly off or `path: "batched"` is set on a primitive-rich scene.

Entities with an `LOD` component or a runtime material override stay on the single-`Mesh` path automatically.

### Make a static-scene render-on-demand

`"render": { "idleMode": "on-demand" }` skips `renderer.render()` for frames where no ECS mutation fired. Useful for inspector / menu / wallpaper scenes. First frame, window resize, and any system write always render — animated scenes (Spin, Tween, WaypointMover, physics) end up rendering every frame anyway, so this is a no-op there.

### Block boot on a hero asset

`"render": { "criticalAssets": ["runtime/materials/hero.material.json"] }` keeps `window.__agf.rendererReady` pending until the listed refs reach `applied` or `failed`. Every other asset stays on the placeholder-then-swap default.

### Snapshot the screen

```
npm run engine:screenshot -- <projectId> --out test-results/<name>.png
```

Boots a transient headless Chromium against the dev server, awaits `rendererReady`, writes the PNG.

## Common Mistakes

- **`MeshRenderer.material` set to a bare manifest id (`"m1-brick"`).** It needs the full path (`"runtime/materials/m1-brick.material.json"`); the schema doesn't reject the short form yet but the runtime quietly fails to load.
- **Writing a project-local system that duplicates an engine primitive.** Spin / Tween / WaypointMover / ParticleEmitter / CinematicCamera already exist — grep first.
- **Putting a `_bump.jpg` (greyscale height map) in `material.normalMap`.** That field expects tangent-space normals (blue-purple). Use `bumpMap` + `bumpScale` for height maps; `m11-ice` uses `normalMap` correctly (the source is a real NormalGL map), `m10-brick` / `m9-hardwood` use `bumpMap`.
- **Setting HDR background without `asBackground: true`.** The HDR becomes IBL only; the background stays whatever `project.render.background` says.
- **Transmissive material (`MeshPhysicalMaterial.transmission > 0`) in a heavily-batched scene.** The renderer adds a transmission pre-pass that re-renders all opaque geometry into a private RT each frame. Lower the cost with `"color": { "transmissionResolutionScale": 0.5 }`.
- **Calling `new TextureLoader().load(...)` from gameplay code.** Texture refs go through material manifests and the asset registry. Bypassing the registry skips diagnostics, HMR, and (in dev) the dev-bridge invalidate flow.

## Hard Rules

`AGENTS.md#Hard Rules` is the authoritative list. The critical-path version:

- **English only** in repo content. Personal notes go to `Notes/` (gitignored).
- **No `engine/core` → `engine/render`, `three`, DOM, Vite imports** (`imports:check`).
- **No raw `world.query()` in hot-path systems** (`systems:check`).
- **Schemas first.** JSON Schema before TS type before system before adapter call.
- **No clipboard / download flows** for state transfer between the running game and an agent — use the dev bridge.
- **No hidden Three.js / Rapier objects** in components.
- **ECS systems by default** for new runtime behaviour; document any deviation at the deviation site.

## Where the agent surfaces live

| Need | CLI | HTTP | `window.__agf` |
|---|---|---|---|
| ECS state snapshot | `engine inspect` | `GET /__agf/snapshot` | `__agf.snapshot()` |
| Diagnostics bus | — | `GET /__agf/diagnostics` | `__agf.diagnostics()`, `__agf.subscribeDiagnostics(fn)` |
| Run a command | — | `POST /__agf/commands` | `__agf.applyCommands([...])` |
| Edit `project.json` | — | `POST /__agf/project-patch` | — |
| Reload one asset | — | `POST /__agf/asset/invalidate` | `__agf.reloadAsset(ref)` |
| Save / load | — | — | `__agf.save()`, `__agf.load()`, `__agf.clearSave()` |
| Bug report bundle | — | `GET /__agf/bug-report` | `__agf.copyDiagnostics()` |
| Renderer info | — | — | `__agf.rendererInfo()` (incl. `gpuMs` when WebGL2 supports `EXT_disjoint_timer_query_webgl2`) |
| Frame timing | — | — | `__agf.frameTiming()` |
| Pick at NDC | — | — | `__agf.pick({ x, y })` |
| Shadow controls | — | — | `__agf.renderer.invalidateShadowMap()`, `setShadowMapAutoUpdate()` |
| Physics raycast / debug | — | — | `__agf.physics.{raycast,setDebugOverlay}` |
| Live tuner sliders | — | — | `__agf.dev.tuner.{add,remove,removeAll,list}` |
| Recording | — | `POST /__agf/recording/{start,stop}` | `__agf.startRecording()`, `__agf.stopRecording()` |

The HTTP surface and `window.__agf` are enabled in DEV only. Production builds ship without `/__agf/*` and without `window.__agf` writes you can depend on; treat them as developer affordances, not engine APIs.

## When to stop

Mark the work done when:

- `npm run engine:check -- examples/<project>` is clean.
- The smallest relevant test or playtest covers the new behaviour.
- A short note in the PR body explains *why* (not just *what*).

If you can't get the loop green in one pass, leave a structured comment with the failing diagnostic and move on — don't paper over the failure with a wider `try/catch` or a disabled check.
