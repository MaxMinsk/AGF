# Backlog

Date: 2026-05-14

This file contains only the currently active detailed sprint work and the next detailed sprint. Keep broad roadmap items in `HIGH_LEVEL_BACKLOG.md`. Move completed sprint details to `BACKLOG_ARCHIVE.md` at sprint close.

## Repository Scope

This folder is the public repository root for the engine.

Example games live inside this repo as nested projects under `examples/`. The main dogfood sample game will be `examples/beacon-world/` when implementation reaches that point.

## Backlog Hygiene

- `HIGH_LEVEL_BACKLOG.md` tracks roadmap epics, parking-lot ideas and coarse priorities.
- `BACKLOG.md` tracks only the active detailed sprint and the next detailed sprint.
- `BACKLOG_ARCHIVE.md` stores completed sprint summaries and links to shipped artifacts.
- At sprint close, move completed sprint details out of `BACKLOG.md` and into `BACKLOG_ARCHIVE.md`.
- Do not let completed stories accumulate in the active backlog.
- Keep story text short enough for agents to load quickly.
- Each story should include tasks, acceptance criteria and verification.
- Documentation, code comments, identifiers, diagnostics and in-app text must be English.

## Next Sprint candidates

- **M21-shadow-static-caster-tag** — highest-impact follow-up from `m21-shadows-bench-perf.md`. Reintroduces the static-shadow optimization without losing the dynamic-shadow correctness from S51. Tag entities as `ShadowCaster.dynamic: true|false` (default false, so movement explicitly opts in). Renderer runs with `shadowMap.autoUpdate = false`; a movement-aware system flips `renderer.shadowMap.needsUpdate = true` on any frame a dynamic-tagged caster's LTW changed (or a static one was added / removed). On shadows-bench that's 12 entities (6 cars + 6 tree roots) marked dynamic, ~290 entities skipping the per-frame shadow pass. Expected: another 30-50 % off renderMs on top of the existing baseline. Acceptance: live probe shows dynamic cars / trees move their shadows correctly + the previous shadow tuner UI still works.
- **M21-shadow-map-size-real-hw** — `m21-shadows-bench-perf.md` measured shadowMapSize 1024 → 512 at only −3.8 % renderMs in headless software-WebGL. Real GPUs care a lot more about shadow-map fill rate + VRAM bandwidth. Re-run `scripts/perf-probe-shadows.mjs --only baseline,512map,2048map` on the user's machine, write the numbers into the same research note. If real-hw savings are large, may justify dropping shadows-bench default to 512 or auto-scaling based on device perf hint.
- **M21-fxaa-cost-isolation** — quick probe: extend `scripts/perf-probe-shadows.mjs` with a `noFXAA` scenario (`render.post = []`), measure delta. Hypothesis: < 0.05 ms, but worth confirming so we know FXAA isn't quietly dragging down the perf budget.

- **M17-batch-perf-investigation** — S50 brought drawCalls 203 → 5 and CPU-measured `renderMs` 3.60 → 0.39 (9×) but the user reports the dev-overlay FPS readout is **lower** with batching on. Headless software-WebGL caps at ~5 fps so the perf comparison can't be done there. Hypotheses + concrete probes:
  - `instanceMatrix.needsUpdate = true` fires every frame in `setBucketInstanceTransform` regardless of whether the matrix changed. With 305 instances × 64 bytes = 19.5 KB GPU upload every frame even for static buildings / rocks / roads. Fix: track last-written matrix per (handle, instance) + skip the write when elements are bit-identical, OR consume an ECS dirty bit on `LocalToWorld`.
  - `frustumCulled = false` on every InstancedMesh bucket. All 305 instances render in every pass (main + each CSM cascade) regardless of camera frustum. Without batching, each single Mesh frustum-culls per-pass; for a scene with 305 entities spanning ±40 units, that probably removes 60–80% of the work per cascade. Fix: leave frustumCulled=true and compute a bucket bounding sphere that grows as instances are added (recompute lazily when an instance leaves the current sphere).
  - `instanceColor` attribute fetch + interpolation costs per-vertex in the standard material's vertex shader. A bucket-color material (when every instance shares one color) might benefit from a fast-path that skips the attribute. Less likely to matter than #1/#2 — instanceColor is a single Vec3 attribute, cheap on modern GPUs.
  - Acceptance: dev-overlay FPS on shadows-bench should match or beat the non-batched baseline. Output: `docs/research/m17-batching-perf-investigation.md` + per-fix benchmark numbers, then the actual fixes land as follow-up stories.

- **M17-batch-glb-meshes** — today the BatchingSystem only batches entities whose `MeshRenderer.mesh` is a built-in primitive (box/sphere/plane). Any GLB / asset-path mesh falls through to single-Mesh rendering even when many entities share the same `runtime/models/<name>.glb`. The renderer already loads geometry once via `AssetRegistry`; the batcher needs to promote the bucket key to include arbitrary mesh refs + cache the loaded `BufferGeometry` so multiple instances share one InstancedMesh. Acceptance: beacon-world's beacon + core glb instances collapse to 2 buckets (one per (model + shadow + group)) instead of 8 single Meshes.
- **M17-batch-material-manifests** — entities with `MeshRenderer.material = "runtime/materials/<x>.material.json"` also fall through today. With per-instance color now available (S50), texture-less manifests (Standard with only color/roughness/metalness) could route through the same InstancedMesh path. Texture-bearing manifests need a separate bucket per manifest (texture uniforms can't vary per-instance without atlasing — defer). Acceptance: shadows-bench + beacon-world manifest-material entities batch when textures are absent.
- **M17-batch-default-on** — once GLB + manifest batching land, flip `autoBatchPrimitives` (renamed `autoBatch`) on by default and update existing project.json files to opt out only where they need single-Mesh semantics. Goal: agents stop thinking about Batchable for the typical case.
- **RENDER-bucket-key-architecture** — current bucket key is a hand-rolled string `instanced|<mesh>|<shadow>|<group>`. With GLB + manifests joining the routing logic between InstancedMesh and BatchedMesh paths gets messier. Investigate moving to a typed BucketSpec + Map<hash, BucketRecord>, and revisit the dispatch between bucketer (M17) and batched-mesh-system (M17-b) under a single abstraction.

## Next Sprint: Sprint 52 — shadow perf + shadows-bench polish

Двойной фокус: восстановить визуальный уровень shadows-bench (после S51 fixes картинка стала тусклее — менялись normalBias, autoUpdate, материалы под per-frame shadows) **и** закрыть perf-regression через static-caster tagging (главный приз из S51 deepdive). Плюс пара мелких follow-up'ов из S51, чтобы не оставлять хвосты.

### Stories

1. **POLISH-shadows-bench-lighting** — после S47/S51 ambient/directional/CSM intensity подбирались под статичные тени. С `autoUpdate=true` и шире сценой картинка стала тусклой. Пересмотреть `lightIntensity`, ambient, `shadowNormalBias` (текущий 0.12 при 1024 shadow map — был тюнен под 2048, после drop возможен overshoot). Опционально: включить `render.color.toneMapping: "aces-filmic"` или `agx` (сейчас `"none"`, что даёт линейный clamp и убитые highlights). Acceptance: визуально светлее без потерь по детализации тени; before/after скриншоты в коммит.
2. **POLISH-shadows-bench-materials** — деревья/здания/дороги выглядят плоско; рefactor material manifest'ов на тёплые building tones, brighter canopy, заметный asphalt для дорог. По возможности оставаться в bucket-batchable-zone (Standard без текстур) чтобы auto-batch не отвалился.
3. **POLISH-shadows-bench-composition** — добавить разнообразие: вариативность размеров деревьев (±20% scale random), 4-6 фонарных столбов вдоль дорог, пара заборов / декоративных боксов вокруг центральной площади. Цель: убрать ощущение «лего с одинаковыми деталями».
4. **POLISH-shadows-bench-sky** — solid `background: #3a5066` выглядит дешёво. Попробовать HDR sky (если уже подключён environment loader) или procedural sky gradient. Сейчас environment пустой; первая опция — adapter-level skybox + reflection envmap. Если slot занят (M21-environment пока не до конца готов), оставить gradient.
5. **M21-shadow-static-caster-tag** — главный perf-приз из S51 deepdive. `ShadowCaster { dynamic: boolean }` (default false). Renderer ставит `shadowMap.autoUpdate = false`; новый `DynamicShadowSystem` слушает LTW changes на dynamic-tagged casters + sets `renderer.shadowMap.needsUpdate = true` when they move. Acceptance: `perf-probe-shadows.mjs --only baseline,static-caster-tag` показывает ≥ 25% drop в renderMs; cars + swaying trees продолжают корректно отбрасывать ездящие тени.
6. **DOCTOR-shadow-section** — like S51 Batching: section, surface `shadows.algorithm + csm.cascades + csm.shadowMapSize + autoUpdate` в `engine doctor` output. Plus a recommendation: «3 cascades cost ~17% renderMs vs 2; consider downgrading for outdoor scenes». Покажет следующему агенту что мы уже знаем про trade-off.
7. **M21-fxaa-cost-isolation** — расширить `scripts/perf-probe-shadows.mjs` сценарием `noFXAA` (`render.post = []`). Измерить, дописать в `docs/research/m21-shadows-bench-perf.md`. Hypothesis: < 0.05 ms но quick win если ошибаемся.
8. **shadow-tuner-persistence** — S48 UI shadow tuner не сохраняет настройки, поэтому tune→reload→lost. Добавить save-to-project.json button (`POST /__agf/project-patch` или прямой fs API в DEV) + load на boot. Делает tuner-workflow реально итеративным.
9. **render-pool-abstraction** (carried from S48) — unify InstancedMesh / BatchedMesh / Particle pools под общую BucketSpec + dispatcher. Готовит почву под `RENDER-bucket-key-architecture` (typed key) и `M17-bvh-extension` (BVH-augmented bucket variant) которые в backlog'е дальше.

### Out of scope

- `M21-shadow-map-size-real-hw` — нужно прогнать probe **на машине пользователя**, не агент. Перенесено в Next Sprint candidates с пометкой «user-driven measurement».
- `M17-bvh-extension` — крупная фича, требует отдельного спринта.

## Current Sprint: Sprint 51 — doctor batching report + agent docs refresh

Small follow-up on S50: the auto-batch flag + per-instance color landed but neither shows up in `engine doctor` or `docs/agent/build-a-game.md`, so an agent inheriting an example can't tell whether batching is engaged or how to opt out. This sprint closes that loop.

### Stories

1. **DOCTOR-batching-report** ✅ — `engine doctor` gains a top-level `Batching:` section. Reads `project.json#render.batching.auto` and uses the existing batch-candidates walker to break renderable entities into primitives (box / sphere / plane) vs externals (.glb / .gltf). Reports per-class entity count, bucket count, and how many draw calls collapsed (or *would* collapse if auto were on). When auto is OFF but primitives could batch, surfaces a `Auto-batch is off — set render.batching.auto: true` recommendation. Also counts explicit `Batchable` annotations and `Batchable: { enabled: false }` opt-outs. Regression: `tests/unit/doctor-batching.test.ts` (4 cases).
2. **DOCS-build-a-game-batching** ✅ — added a "Cut draw calls with auto-batch" recipe to `docs/agent/build-a-game.md` covering the one-line opt-in, per-entity opt-out, group hint, and the `engine doctor` verification step.
3. **M17-batched-mesh-primary** ✅ — BatchedMesh adapter path gets the headline perf knob wired up: `perObjectFrustumCulled = true` explicit, geometries get `computeBoundingBox()` + `computeBoundingSphere()` on `addBatchedGeometry` so per-instance culling can run, and a new `setBatchedInstanceColor` puts the path at colour-parity with InstancedMesh. `BatchingOptions.defaultPath` (`"instanced" | "batched"`, default `"instanced"`) plumbed through `RuntimeOptions.batchingPath` ← `project.json#render.batching.path`. Doctor surfaces `path=...` in its Batching section. 3 new tests in `tests/unit/batching-system-batched-path.test.ts`.
4. **M17-batched-colour-squaring fix** ✅ — first try at shadows-bench `path: "batched"` made the scene visibly darker. Root cause: `bucketKey` was still keyed on `renderer.color` (regression vs the S50 InstancedMesh fix) AND the bucket material colour was set to the first entity's `renderer.color`. Three.js multiplies `_batchColor × material.color` per fragment, so the per-instance colour and bucket colour squared. Fix mirrors S50: drop colour from the key + leave `spec.color` undefined → adapter anchors material at white. Regression test in `batching-system-batched-path.test.ts` asserts `spec.color === undefined` for a shared bucket.
5. **M17-batched-vs-instanced measurement** ✅ — wrote `scripts/perf-probe-batching.mjs` (Playwright-driven A/B; patches `project.json#render.batching.path`, reloads, samples `__agf.rendererInfo()` + `__agf.frameTiming()` for N seconds, restores config on exit). On shadows-bench (305 entities, 3-cascade CSM, headless software-WebGL): `batched` saves draw calls (11 → 7, −36 %) and triangles (450 662 → 370 092, −17.9 %) via per-instance culling, but `renderMs` rises +63.5 % (0.53 → 0.87) and `totalFrameMs` rises +24 %. Cause: `BatchedMesh.onBeforeRender` walks all 305 instances per pass + `multiDrawArraysIndirect` carries one drawRange per visible instance — overhead dominates on small scenes where most instances are in view. Decision: shadows-bench reverts to `path: "instanced"`; `path: "batched"` stays as an option (plumbing intact) for scenes that satisfy the crossover (much-bigger scene, narrower frustum, or via BVH extension). Findings written up at `docs/research/m17-batched-vs-instanced-shadows-bench.md`.
6. **SHADOWS-bench-perf-deepdive** ✅ — wrote `scripts/perf-probe-shadows.mjs` (sister probe, walks named project.json scenarios under fresh browsers each so PCSS's one-way substitution can't leak between runs). Measured 6 scenarios on shadows-bench. Findings disposed in `docs/research/m21-shadows-bench-perf.md`:
    - **Cascade count = the main lever.** 3 → 2 cascades = −17.1 % renderMs (−25 % shadow triangles). 3 → 1 adds only another 2 pts — the main-pass cost stays.
    - **PCSS cost ≈ +6.5 %.** Smaller than expected; PCSS substitution isn't the bottleneck on this scene.
    - **shadowMapSize 1024 → 512 = −3.8 %.** Tiny on software-WebGL; should re-measure on real hardware (fill rate + VRAM bandwidth changes the ranking).
    - **`programs` flat across all scenarios.** No shader-program churn → BatchingSystem / CSM material rebuild hypothesis dismissed.
    - **Combined `pcf + 2c + 512` = −15.2 % renderMs / −13.7 % totalFrameMs** at moderate visual cost. Sweet spot if pickup a single config.
  - shadows-bench config not changed — visual trade-off is the user's call. Three follow-up stories filed in Next Sprint candidates: `M21-shadow-static-caster-tag` (highest impact — keep the dynamic-shadow correctness from S51 while skipping the per-frame shadow re-render for ~290 static entities), `M21-shadow-map-size-real-hw`, `M21-fxaa-cost-isolation`.

### Verification

- `npm run typecheck` ✅
- `npx vitest run tests/unit/doctor-batching.test.ts` ✅ — 4 tests
- `npm run engine:doctor -- examples/shadows-bench` and `-- examples/beacon-world` print the new `Batching:` section correctly.

## Archived: Sprint 50 — auto-batch + per-instance color + perf squeeze

Three compounding wins for shadows-bench (one project.json flag): **drawCalls 203 → 5** (40×) and **renderMs 3.60 → 0.39** (9×). Plus the perf-squeeze follow-ups landed in the same PR after the first round revealed a static-instance GPU-upload regression.

### Stories

1. **M17-batchable-color-variants** ✅ — adapter `acquireBucket({ useInstanceColor: true })` allocates the `instanceColor` InstancedBufferAttribute on the InstancedMesh + `setBucketInstanceColor(handle, index, color)` writes per-slot colour. `BatchingSystem.updateInstanced` drops `renderer.color` from the bucket key so different-coloured entities collapse into one InstancedMesh.
2. **M17-auto-batch-primitives** ✅ — `BatchingOptions.autoIncludePrimitives` plumbed through `RuntimeOptions.autoBatchPrimitives` + `project.json#render.batching.auto`. When on, every entity with a built-in primitive mesh, no LOD, no manifest material is auto-batched without `Batchable`. Per-entity opt-out: `Batchable: { enabled: false }`. All 5 example projects (hello-3d, beacon-world, batch-bench, physics-bench, shadows-bench) have the flag on.
3. **M17-system-ordering** ✅ — BatchingSystem moved BEFORE MeshLifecycleSystem so `BatchedMeshHandle` is set first. `MeshLifecycleSystem.frameUpdate` AND `ThreeRenderer.refreshMeshes` (the fallback path called every frame from `render()`) both now skip entities with `BatchedMeshHandle` — the historical filter only looked at `Batchable`, so auto-batched entities were double-rendered (the 310-draw / 27 ms-frame regression caught during S50 development).
4. **M17-perf-ltw-cache** ✅ — `BatchingSystem.InstancedRecord.lastWorld` caches the last-written `[px,py,pz,rx,ry,rz,sx,sy,sz]` per instance. `updateInstanced` skips both `setBucketInstanceTransform` AND `instanceMatrix.needsUpdate` when the LTW is bit-identical. Static buildings / rocks / roads no longer force a full 305 × 16 float GPU re-upload every frame.
5. **M17-perf-color-cache** ✅ — Same idea for `setBucketInstanceColor` — cached per-instance colour means a frame with no colour changes doesn't dirty the instanceColor attribute.
6. **M17-perf-bucket-frustum-culling** ✅ — InstancedMesh buckets now ship with `frustumCulled = true`. `recomputeBucketBoundingSphere(handle)` is called once per frame per dirty bucket (tracked by `dirtyInstancedBuckets: Set<BucketHandle>` populated by the LTW cache misses + instance add/remove). Three.js then skips the whole bucket per camera-pass when its sphere is outside the frustum.
7. **shadows-bench adoption** ✅ — `project.json#render.batching.auto: true`; trees + rocks + **buildings** repositioned to clear the road corridors via `clearRoadCorridor(x, z, buffer)` (now per-entity buffer; buildings use `max(w, d)/2 + 0.5` so their footprint never crosses the kerb).
8. **Three.js batching research note** ✅ — `docs/research/m17-three-batching-references.md` summarises the relevant `References/three.js/examples/*.html` (`webgl_mesh_batch`, `webgl_instancing_dynamic`, `webgl_batch_lod_bvh`, etc.) and sequences the follow-up perf work into Sprint 51 candidates: BatchedMesh primary path with `perObjectFrustumCulled`, BVH extension, LOD-batched geometry.

### Verification

- `npm run typecheck` ✅
- `npm run test` ✅ — 69 files, 433 tests (one existing batching test rewritten for the new colour-variant semantics)
- shadows-bench live probe with `batching.auto: true`:
  - drawCalls: **203 → 5** (40× fewer)
  - frame time: **5.4 ms → 1.4 ms** (4× faster)
  - `meshes: 0`, `buckets: 3`, `bucketInstances: 305`, `handleLeak: 0`

### Notes for Sprint 51+

`Next Sprint candidates` covers the remaining batching work: GLB mesh batching, material-manifest batching, default-on once those land, and a cleaner BucketSpec abstraction over the InstancedMesh + BatchedMesh paths.

## Archived: Sprint 49 — rendererInfo accuracy + hygiene tidy

Small follow-ups noticed after S48 landed:

### Stories

1. **RENDERER-info-autoReset** ✅ — `__agf.rendererInfo().drawCalls` reported `1` for shadows-bench despite the scene having 300+ meshes. Root cause: `WebGLRenderer.info` resets its counters at the start of every `.render()` call, and the EffectComposer (FXAA + OutputPass in shadows-bench) issues 3 render passes per frame — so the values we read after composer.render() reflected only the final OutputPass, a single full-screen quad. Disabled `device.info.autoReset` + reset manually at the start of `draw()` so counters accumulate across every pass. shadows-bench now reports `drawCalls: 194, triangles: 70 274`.
2. **HYGIENE-backlog-cyrillic** ✅ — Removed a stray Russian phrase from `BACKLOG.md`'s S43 archive entry (`repo:hygiene` ignores it because it's already on `main`, but cleaning it up now means no future scanning surprise).

### Verification

- `npm run typecheck` ✅
- `npm run test` ✅ — 433 tests
- Live probe shadows-bench: `drawCalls: 194` (was `1`), `triangles: 70 274` (was `1`), zero page errors.

## Archived: Sprint 48 — Schema split + shadows-bench cars

Two heavy-lift items: a structural refactor (scene.schema.json was 800 lines; agents drowned opening it cold) plus a visible feature (shadows-bench gains roads + cars on the wind-swept village). Plus a fix for the S45 list/explain bug that pointed at the wrong project-local schema filename.

### Stories

1. **SCHEMA-scene-split** ✅ — `scene.schema.json` shrinks from 798 → 210 lines. Component definitions move to `schemas/components/{core,render,camera,physics-3d,gamefeel,network}.schema.json` (75-352 lines each). Shared types (`vec3`) move to `schemas/common.schema.json`. New `engine/tools/schemas/load-scene-schema.ts` bundler walks external `$ref`s, inlines them back into a single in-memory schema for AJV — no cross-file AJV machinery, all 7 consumers (project-check, list-components, explain-component, the 4 scene-* unit tests) call the same loader. 429 unit tests still green.
2. **list/explain fix** ✅ — `engine list components <projectDir>` and `engine explain component <Name> <projectDir>` were pointing at the non-existent `project-local-components.schema.json`. Now read `<projectDir>/schemas/scene-extensions.schema.json` (the file `engine check` actually uses) and resolve `$ref`s through it. Verified: shadows-bench's `RtsCamera` shows up in the catalog.
3. **M19-WaypointMover** ✅ — generic `WaypointMover { waypoints[], loop, elapsed, faceForward }` component + `WaypointMoverSystem`. Sibling of CinematicCamera but for any Transform (not just the active camera) + derives yaw from velocity when `faceForward: true`. Replay-safe via fixed-update. 4 unit tests.
4. **shadows-bench roads + cars** ✅ — 2 cross-shaped roads (EW + NS) sit just above the ground. 6 cars ping-pong along them, each on its own lane (±1.2 / 0.0) so traffic never collides. Each car is a parent entity (WaypointMover-driven) with child body + cabin + 4 wheels — proper car shape, not a cube. `pulse`-loop Tween on each body provides a subtle ~0.6° roll wobble with staggered phase.
5. **shadows-bench trees actually sway** ✅ — the S47 wind-sway tween wasn't visible because the canopy was a sibling entity, not parented to the trunk. Restructured each tree as a root + child trunk + child canopy hierarchy parented to a sway-tweened root, so the whole tree pivots from the base.

### Deliverables

- `schemas/scene.schema.json` (798 → 210 lines)
- `schemas/common.schema.json` + `schemas/components/*.schema.json` (new)
- `engine/tools/schemas/load-scene-schema.ts` (new — bundler)
- `engine/core/systems/waypoint-mover-system.ts` (new)
- `engine/runtime/start.ts` — register WaypointMoverSystem
- `examples/shadows-bench/bootstrap.ts` — roads + 6 cars (parent/child hierarchy) + tree hierarchy rewrite for visible sway
- `tests/unit/waypoint-mover-system.test.ts` (new) + 4 scene-* tests now use `loadBundledSceneSchema`
- `engine/tools/components/{list,explain}-component.ts` — fixed scene-extensions path
- `SECURITY.md` — slimmed down, dropped maintainer's personal email

### Verification

- `npm run typecheck` ✅
- `npm run test` ✅ — 69 files, 433 tests
- `npm run engine:check:examples` ✅ — 5 projects OK
- `npm run engine:list -- components examples/shadows-bench` ✅ — 20 built-ins + `RtsCamera` (project-local)
- Live probe: trees sway (tree.0 X rotation oscillates), cars move on dedicated lanes (car.0 traverses -34→-21 in 1.5s), zero page errors

## Archived: Sprint 47 — Game-feel pass (tween / particles / cinematic / PCSS / shadows-bench polish)

Visible feedback layer + shadow polish. Adds 3 ECS-native game-feel primitives, fixes the S41 PCSS substitution that was silently no-op'ing, and tunes the shadows-bench scene to look alive.

### Stories

1. **M19-tween** ✅ — `Tweens` component (array of tween specs) + `TweenSystem` (fixedUpdate, replay-deterministic). Easing kinds: linear / easeIn / easeOut / easeInOut / `pulse` (sin(πt) for one-shot bounces). Loop modes: none / loop / ping-pong. 6 unit tests.
2. **M19-particle-preset** ✅ — `ParticleEmitter` component + `ParticleEmitterSystem` + adapter `ParticlePool` API (additive InstancedMesh). Built-in presets: spark / glow / pulse. Auto-removed when emitter lifetime expires and particles drain.
3. **M21-cam-cinematic** ✅ — `CinematicCamera` component (waypoint list + per-segment ease + loop) + `CinematicCameraSystem`. Replay-safe via `elapsed` on the component.
4. **M21-shadow-pcss-csm + bug fix** ✅ — discovered the S41/S44 PCSS shader-chunk substitution silently no-op'd because three.js bumped whitespace inside `shadowmap_pars_fragment`. Replaced the literal match with a regex that tolerates whitespace + emits a console warning if upstream drifts. Added a regression test asserting the chunk actually contains `PCSS(` after `applyPcssShadowChunks()`. CSMShader uses the same `getShadow` symbol so cascades inherit PCSS automatically — no separate patch needed.
5. **beacon-world adoption** ✅ — pickup: spark burst on the core at the moment of pickup. Repair: `pulse`-ease Tween bounces beacon scale × 1.18 over 0.36 s + a 0.5 s spark burst. Both auto-remove themselves.
6. **shadows-bench polish** ✅ — fixed tree crown hovering above trunk (sphere primitive's radius is 0.5, not 1; corrected the canopy y offset). Added `pulse`-loop Tween on every trunk's X rotation (1.6–2.8° sway, staggered phase) so the forest sways in the wind. Tuned shadows: PCSS algorithm + 3 cascades + 1024 maps + `shadowNormalBias: 0.12` + near-zero shadowBias to kill the peter-pan gap and stay 120 fps at max zoom. Reduced PCSS `LIGHT_WORLD_SIZE` from 0.005 → 0.0025 for a tighter penumbra. Plumbed `shadowNormalBias` through CSM config + project schema + adapter.
7. **shadows-bench shadow tuner** ✅ — project-local UI panel under the FPS overlay (top-right). Sliders for cascades (2–4) / maxFar / shadowMapSize / shadowBias / shadowNormalBias / lightIntensity, picker for algorithm (PCF / VSM / PCSS), Reset button restores project.json defaults. Plumbs through new `adapter.setShadowAlgorithm(kind)` which recompiles existing materials so the new sampler binding takes effect; PCSS is treated as a one-way transition (the shader-chunk substitution is process-wide), surfaced as a "reload required" note that locks the picker. Beacon-world repair particles raised from `offset y=0.6` → `y=1.4` so sparks fountain above the beacon tip instead of inside the mesh.

### Deliverables

- `engine/core/systems/tween-system.ts` (new)
- `engine/render/systems/cinematic-camera-system.ts` (new)
- `engine/render/systems/particle-emitter-system.ts` (new)
- `engine/render/three-render-adapter.ts` — `ParticlePool` API, `CsmConfig.shadowNormalBias`, per-cascade normalBias apply
- `engine/render/shadow-pcss.ts` — regex-based substitution + console warning + tighter LIGHT_WORLD_SIZE
- `engine/runtime/start.ts` — registers tween + particle + cinematic systems
- `schemas/scene.schema.json` — Tweens / ParticleEmitter / CinematicCamera defs + `pulse` ease
- `schemas/project.schema.json` — `shadows.csm.shadowNormalBias`
- `tests/unit/tween-system.test.ts` (new) + `shadow-pcss-algorithm.test.ts` regression
- `examples/beacon-world/src/systems/pickup-system.ts` — game-feel hooks
- `examples/shadows-bench/bootstrap.ts` + `project.json` — tree fix, sway, shadow tune
- `docs/research/scene-schema-split-notes.md` (new — for S48 follow-up)
- `THIRD_PARTY_NOTICES.md` — removed stale References/ block (those folders are gitignored)

### Verification

- `npm run typecheck` ✅
- `npm run test` ✅ — 68 files, 429 tests (+9 from S46).
- `npm run engine:check:examples` ✅
- `npm run test:e2e:smoke` ✅ — 11/11 in 25 s
- Visual: beacon repair bounces + sparkles; pickup sparkles on core; trees sway; shadow gap under buildings closed; 120 fps maintained at max zoom in shadows-bench

## Archived: Sprint 46 — CI e2e stabilization

Narrow-focus sprint: the new `e2e.yml` workflow added in Sprint 44 fails the same ~10 specs on every CI run while the same specs pass locally on macOS in 5–15s each. Closing that gap is a blocker for treating the e2e workflow as a useful PR gate.

### Research

- **`docs/research/e2e-ci-investigation.md`** ✅ — Root cause: 5s inline `waitForFunction` budgets calibrated for local macOS frame pacing; ubuntu-latest's SwiftShader software-WebGL + cold Vite transform push the first physics tick past that budget. No production regressions — every failure is a timeout, never a wrong value.

### Stories

1. **CI-e2e-artifacts** ✅ — `tests/e2e/_shared/artifacts.ts` Playwright fixture that on test failure attaches console log + `__agf.diagnostics()` + `rendererInfo()` + `frameTiming()`. Workflow uploads `playwright-report/` and `test-results/` as artifacts.
2. **CI-e2e-helpers** ✅ — `tests/e2e/_shared/agf.ts` exports `waitForAgfReady(page)` (gates on `__agf` exists → `rendererReady` → first scene-load → first frame tick) and `waitForAgfPredicate(page, fn)` (snapshot predicate poll with consistent 30s default). Replaces the historical inline `{ timeout: 5_000 }` pattern.
3. **CI-e2e-preview-mode** ✅ — `playwright.preview.config.ts` runs gameplay + rendering specs against `vite build` + `vite preview` instead of the dev server. Avoids per-request TypeScript transform + HMR overhead. New scripts `test:e2e:smoke`, `test:e2e:preview`, `test:e2e:full-dev`.
4. **CI-e2e-required-smoke** ✅ — 14-test smoke project (app, project-switcher×3, hello-3d-hierarchy×2, dev-bridge×5, playtest-runner×3). All pass locally in 32s. `preflight` now runs `test:e2e:smoke`, not the full suite.
5. **CI-e2e-full-nightly** ✅ — `.github/workflows/e2e.yml` becomes a smoke-only PR gate. New `.github/workflows/e2e-nightly.yml` runs the full dev-server matrix + preview-mode matrix on cron (04:00 UTC) + workflow_dispatch + pushes to main.

### Migrated specs

`hello-3d-hierarchy.spec.ts` + `project-switcher.spec.ts` use the new `waitForAgfReady` helper. Other specs keep their existing waits — they live in the nightly chromium/preview projects and don't block PRs.

### Verification

- `npm run typecheck` ✅
- `npm run test:e2e:smoke` ✅ — 14/14 passed in 32s locally.
- `npm run test` ✅ — 422 unit tests still pass.

## Archived: Sprint 45 — Agent authoring helpers

Closes the "should fix soon" list from `Notes/codex_review_2.md` — give an agent a discoverable authoring CLI so the `engine new → engine list → engine explain → engine check → engine run → engine screenshot` loop is one command per step.

### Stories

1. **AGENT-cli-list-components** ✅ — `engine list components [projectDir]` enumerates every built-in component declared on `scene.schema.json` + every project-local component in `<projectDir>/project-local-components.schema.json`. Reads `description` straight from the schema. `engine list examples` lists every project under `examples/` (`hello-3d`, `beacon-world`, batch/physics/shadows-bench).
2. **AGENT-cli-explain** ✅ — `engine explain component <Name> [projectDir]` resolves the schema definition, lists required + optional fields with their types + descriptions, and prints a derived authoring example (required-only object).
3. **AGENT-cli-new** ✅ — `engine new <name> --template hello-3d [--target <dir>]` copies the template tree, rewrites `project.json` + `template.json` for the new id, runs `engine check` on the result. Skips `node_modules` / `dist` / `_sources`. 4 unit tests cover the happy path, invalid name, destination collision, missing template.
4. **AGENT-cli-screenshot** ✅ — `engine screenshot <projectId> --out <path>` boots a headless Chromium via `@playwright/test`'s low-level API, navigates to `?project=<id>`, awaits `__agf.rendererReady`, settles 250ms, writes the PNG. Auto-boots a transient Vite dev server when one isn't already listening; `--reuse-server` opts out.
5. **AGENT-docs-build-a-game** ✅ — `docs/agent/build-a-game.md`: one-page contract covering the mental model, the discover → edit → validate → inspect → run → playtest loop, common recipes (add entity, project-local component, custom system, asset import, screenshot), hard rules, the dev-bridge surface table, the "stop" criteria.

### Deliverables

- `engine/tools/components/list-components.ts` (new)
- `engine/tools/components/explain-component.ts` (new)
- `engine/tools/new/project-new.ts` (new)
- `engine/tools/screenshot/project-screenshot.ts` (new)
- `engine/tools/cli.ts` — wired `list` / `explain` / `new` / `screenshot` subcommands + usage block
- `package.json` — `engine:list`, `engine:explain`, `engine:new`, `engine:screenshot` scripts
- `tests/unit/project-new.test.ts` (new)
- `docs/agent/build-a-game.md` (new)

### Verification

- `npm run typecheck` ✅
- `npm run engine:list -- components` ✅ — 17 built-ins printed with descriptions.
- `npm run engine:explain -- component Transform` ✅
- `npm run engine:list -- examples` ✅
- `npm run test` ✅ — 67 files, **422 tests** (was 412; +4 project-new tests + 4 cube schema tests + 2 PCSS tests).

## Archived: Sprint 44 — CI parity + renderer follow-ups

Follows Sprint 43's open-source readiness work. Closes the remaining `Notes/codex_review_2.md` gates (CI parity + e2e stability) and lands the renderer follow-ups deferred from S43.

### Stories

1. **OSS-ci-parity** ✅ — Extended `.github/workflows/repo-hygiene.yml` with `imports:check` + `systems:check` in the typecheck job, plus two new jobs: `node-backend-smoke` (`npm run backend:node`) and `dotnet-backend-build` (Release build). New `.github/workflows/e2e.yml` runs Playwright in its own workflow + uploads the playwright-report artifact on failure.
2. **OSS-e2e-stability** ✅ — Playwright config gains a `serial-heavy` project for `hmr-stress` + `multiclient-roundtrip` (serial, 90s timeout, retries=2). `hmr-stress` alternates the material body each cycle so Vite's watcher doesn't coalesce identical-bytes writes. `app.spec.ts` + `score-pulse.spec.ts` await `__agf.rendererReady` before pixel sampling / gameplay applyCommands so they don't race the renderer warm-up.
3. **M21-shadow-pcss-modern** ✅ — Root-cause fix for the S41 PCSS no-op. The substitution targets the BASIC `getShadow` variant (texture2D + raw depth); modern `PCFShadowMap` uses `sampler2DShadow` which only returns 0/1, so the substitution silently does nothing. Adapter now maps `algorithm: "pcss"` → `BasicShadowMap` (matching three's own `webgl_shadowmap_pcss.html`). `algorithm: "pcf"` stays on modern `PCFShadowMap`. New `tests/unit/shadow-pcss-algorithm.test.ts` guards the mapping.
4. **M21-env-cube** ✅ — `scene.environment.kind: "cube"` with a 6-face URL array `[+x, -x, +y, -y, +z, -z]` via `CubeTextureLoader` + `PMREMGenerator.fromCubemap` (IBL-ready, not just a skybox). Schema gains `faces` + an `allOf/if/then` requiring it when `kind: "cube"`. `tests/unit/scene-environment-schema.test.ts` adds 4 cube cases.

### Verification

- `npm run repo:hygiene` ✅
- `npm run typecheck` ✅
- `npm run imports:check` / `systems:check` ✅
- `npm run test` ✅ — `tests/unit/scene-environment-schema.test.ts` + `shadow-pcss-algorithm.test.ts` + `doctor-vendor-budgets.test.ts` + preexisting suite all green (412+ tests).

### Deferred to Sprint 45

Agent-authoring helpers from `Notes/codex_review_2.md`'s "should fix soon" list: `engine new --template`, `engine list components`, `engine explain component`, `engine screenshot`, `docs/agents/build-a-game.md`.

## Archived: Sprint 43 — Open-source readiness

Triggered by `Notes/codex_review_2.md` (open-source readiness audit, 2026-05-14). The review flagged release-hygiene blockers — missing LICENSE, stale README/DEVELOPMENT/backend docs, doctor vs bundle:check budget mismatch, one Cyrillic phrase in a research doc. Sprint 43 closes those gates so AGF can be presented as a pre-alpha engine without confusing first-time readers.

### Stories

1. **OSS-cyrillic-fix** ✅ — Replaced the Russian phrase meaning "almost like Unity" with `"almost Unity-class"` in `docs/research/renderer-ecs-split-investigation.md`.
2. **OSS-hygiene-local** ✅ — `scripts/check-repo-hygiene.mjs` + `npm run repo:hygiene` script + prepended to `preflight`. Local mirror of `.github/workflows/repo-hygiene.yml`.
3. **OSS-license-metadata** ✅ — `LICENSE` (Apache-2.0), `THIRD_PARTY_NOTICES.md` (Draco / Basis Universal / Three.js / Rapier / AJV provenance), `package.json` gets `license`, `repository`, `bugs`, `homepage`, `keywords`, `description`.
4. **OSS-community** ✅ — `CONTRIBUTING.md` (preflight contract + agent rules), `SECURITY.md` (DEV-only `__agf` boundary, vulnerability reporting).
5. **OSS-readme-refresh** ✅ — Replaced Sprint-1-era README with pre-alpha status, quickstart, what-works-today list, examples, agent workflow, limitations, roadmap, license.
6. **OSS-docs-sync** ✅ — `docs/DEVELOPMENT.md` drops "wired during Sprint 1", lists actual command surface; `examples/backends/README.md` documents Node WebSocket `--serve` mode; `examples/backends/node-world-server/README.md` documents serve mode + threat model.
7. **OSS-doctor-budget-align** ✅ — `engine doctor` now splits main-chunk budgets from vendor-chunk budgets matching `scripts/check-bundle-size.mjs`. `DEFAULT_VENDOR_BUDGETS` default for `rapier-` / `three-`. Per-project `bundle.vendors` overrides. 4 unit tests (`tests/unit/doctor-vendor-budgets.test.ts`).
8. **OSS-backlog-cleanup** ✅ — `HIGH_LEVEL_BACKLOG.md` "Sequencing the M-list" updated to mark steps 1–6 done, list real outstanding work.

### Verification

- `npm run repo:hygiene` ✅ — 431 tracked files, no Cyrillic.
- `npm run typecheck` ✅.
- `npm run engine:check:examples` ✅ — 5 projects.
- `npm run imports:check` / `systems:check` ✅.
- `npm run test` ✅ — 65 files, 412 tests.
- `npm run engine:doctor -- examples/hello-3d` / `-- examples/beacon-world` — both clean, vendor chunks reported separately within their budgets.

### Deferred to Sprint 44

The renderer / asset-pipeline openers that were originally pencilled for Sprint 43 (PCSS-modern, PCSS-CSM, ASSET-texture-compress, cam-cinematic, env-cube, webgpu-spike, M17-lod-batched, ASSET-decoder-vendor verification) move to Sprint 44 alongside the remaining OSS-readiness work (CI parity, e2e stability).

Default sprint size is 8–12 stories per `feedback-sprint-size`. Sprint 43 lands 8 stories.

### Parking lot

Open work that did not make the Sprint 43 opener list. Each entry stays here until promoted.

#### Renderer (Phase 2 tail)

- `M21-shadow-pcss-modern` Rewrite PCSS substitution against the modern PCF chunk (Vogel + `sampler2DShadow`). S41 only touched the BASIC variant.
- `M21-shadow-pcss-csm` Extend PCSS substitution into `CSMShader.js`.
- `M21-webgpu-spike` Async WebGPU renderer adapter behind a profile flag (`project.json#renderer.backend: "auto" | "webgl" | "webgpu"`).
- `M21-env-cube` Cubemap environment source (6-face cross or per-face URLs) via CubeTextureLoader.
- `M21-cam-cinematic` Scripted camera-track playback (`{ position, target, duration, ease }` waypoints).
- `M21-shadow-soft` Re-evaluate `PCFSoftShadowMap` vs `PCFShadowMap` vs `VSMShadowMap` once three.js stabilises soft shadows.
- `M21-shadow-glb-acne` Self-shadow polish on low-poly GLB meshes; investigate per-material `shadowSide = THREE.BackSide`, scale-aware bias, or polygonOffset overrides.

#### Asset pipeline (M25)

- `ASSET-optimize-command` `engine asset optimize <project> <asset>` CLI invoking gltf-transform with project presets.
- `ASSET-lod-metadata` LOD schema + `engine check` validation (distances strictly increasing, fallback declared).
- `ASSET-texture-doctor` Doctor warnings: huge uncompressed PNG/JPEG, NPOT mismatches, missing KTX2 transcoder path.

#### Batching / scene composition

- `M17-lod-batched` Wire LodSelectionSystem to BatchedMesh's per-instance geometry id so LOD swap doesn't drop the entity out of the bucket.
- `M17-static-merge-spike` Static geometry merge with reverse `EntityId` lookup for picking. Strictly opt-in per-entity (`StaticMerge` tag). Deferred until a 10k+ static-prop project asks (see `docs/research/m17-static-merge-investigation.md`).
- `M3-c-load` + `M3-c-beacon` Wire `expandScenePrefabs` into scene-load + Beacon adopts prefab instances.
- `M16-cache-e` Reusable matrices / pooled scratch buffers inside the cache layer.

#### Runtime + dev surface

- `RUNTIME-progressive-loading` Asset manifest `priority: "critical" | "deferred"` + placeholder primitive + scene phases.
- `RUNTIME-idle-rendering` Render-on-demand mode for static menus / inspector tools.
- `RUNTIME-gpu-timing` Feature-detected GPU timing queries in dev builds.

#### Pre-utsubo carry-overs

- `M20-a..l` Netcode rework (carried from Sprint 32).
- `M2b-seed`, `13.13` audio, `10.5+` C# WS transport.
