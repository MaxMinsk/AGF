# ADR-0013: Reflection probes — CubeCamera-per-entity + envmap binding

## Status

Accepted (2026-05-16). Shipped Sprint 57 (`REFLECTION-cube-probe`) + Sprint 58 (`CubeCamera` world-matrix fix, mipmap-cube-RT, multi-probe layout in material-bench).

## Context

The renderer needed per-object dynamic reflections for the material-bench centre chrome sphere — `scene.environment` alone shows only the static HDR, missing the orbiting outer spheres + stonehenge columns. Three.js doesn't ship a "reflection probe" abstraction; the four candidate building blocks (`CubeCamera`, `Reflector`, `SSRPass`, `LightProbe`) each solve a different slice of the dynamic-reflection problem (recorded in `docs/research/reflection-probes-investigation.md`).

For S57 we picked `CubeCamera + WebGLCubeRenderTarget` per probe entity — the closest fit to a "Unity reflection probe": captures the scene from a point, supplies a per-object `envMap`. The other three candidates (planar mirror / SSR / SH lightprobe) are parked.

## Decision

Two ECS components, both project-data:

- **`ReflectionProbe { size, near, far, updateRate, excludeEntities }`** — tag a position in the world where a cube map should be captured.
- **`EnvmapBinding { probe, intensity? }`** — bind another entity's material `envMap` slot to a probe's render target.

One scheduler-registered system `ReflectionProbeSystem` runs before the main render. Per frame it:

1. Acquires a `WebGLCubeRenderTarget` + `CubeCamera` for any new `ReflectionProbe` entity.
2. Updates each cube cam's world position from the entity's `LocalToWorld`.
3. On the configured cadence (`updateRate` ∈ {0, 15, 30, 60} Hz), hides `excludeEntities` plus the owner itself, calls `cubeCam.update(renderer, scene)`, then restores visibility. `updateRate: 0` means "bake once at boot, never again".
4. Stamps the resulting cube texture onto every entity with a matching `EnvmapBinding` via `setMeshMaterialPatch({ envMap, envMapIntensity })`.

### Critical fixes from initial implementation

Three.js's `CubeCamera.update()` auto-refreshes its world matrix **only when `parent === null`**. Adding the cube cam to the scene graph (the obvious thing to do) skipped that refresh, so the captured cubemap trailed our `setReflectionProbeTransform` by one full main-render cycle and looked off-centre. Fix: do NOT add the cube cam to the scene; the cam owns its 6 face cameras as children and renders the scene directly when `update()` is called. We additionally call `updateMatrixWorld(true)` inside `updateReflectionProbe` so a future re-parent doesn't silently break.

The render target is built with `{ generateMipmaps: true, minFilter: LinearMipmapLinearFilter, type: HalfFloatType }` so `MeshStandardMaterial.envMap` sampling at `roughness > 0` reads from a box-filtered mip chain. This is **not** PMREM GGX prefilter (which is the textbook correct path for PBR roughness), but the visual difference for moderate roughness (≤ 0.3) is small enough to defer the proper prefilter. The mip-chain regen runs once per probe update — three.js's `CubeCamera.update` handles it.

### Self-reflection avoidance

A probe owner appearing in its own capture is a common bug. The system implicitly adds the probe's own entity id to the exclude set every frame. Callers should additionally list any near-object the probe shouldn't see (e.g. the cement pedestal directly under the centre chrome ball).

## Multi-probe layout (material-bench v2)

The bench currently uses three probes:

- `sphere.centre` — chrome ball's own probe at world (0, 0.85, 0), 128² @ 30 Hz.
- `probe.front` — invisible entity at (0, 1, +5), between the centre ball and the camera. 128² @ 15 Hz.
- `probe.back` — invisible entity at (0, 1, −5), behind the centre ball.

Outer-ring spheres bind by initial angle: `sin(angle) ≥ 0` → `probe.front`, else `probe.back`. Each sphere keeps its probe ref as the ring spins (static binding); visual reflection difference between the two halves of the ring stays even as spheres orbit.

## Consequences

Pro:

- Declarative + ECS-native — projects author probes as scene data, no per-frame imperative API.
- Per-object envmap override is standard three.js; integrates with existing material binding without a new render path.
- Cost is bounded by `updateRate × size² × 6 faces × probeCount` plus mipmap regen; doctor reports an estimate.
- Material-bench centre sphere visibly reflects the orbiting ring + the stonehenge columns + the HDR sky.

Con:

- Cube cam isn't in the scene graph — projects can't parent it to another entity for relative-position reflections without re-acquire logic.
- Mipmap-cube is not PMREM GGX prefilter. `roughness > 0.3` reflective materials read soft but not physically correct; full prefilter lands with `REFLECTION-prefilter` (parking lot).
- Static bindings on orbiting entities mean each outer sphere always reads the same probe regardless of its current world position. Visual diff only emerges between sphere groups, not within one sphere's full orbit.

## Validation

- 505 unit tests + engine:check all clean.
- Live debug via playwright + dev-bridge confirmed all probes have distinct `WebGLCubeRenderTarget.texture.uuid` and correct world positions (centre at 0,0.85,0; front at 0,1,5; back at 0,1,−5).
- User visually verified: centre chrome shows columns + orbit ring; outer halves of the orbit ring show distinct reflections via front / back probes.

## Alternatives Considered

- **Reflector (planar mirror).** Cheaper but planar-only. Useless for spheres.
- **SSR (screen-space).** Cheap and works on any surface but only reflects what's on screen; orbit-ring members behind the camera wouldn't appear in the chrome ball.
- **`LightProbe` + SH9 baking.** Diffuse-only; doesn't give sharp reflections.
- **WebGPU `BPCEM` (box-projected parallax-corrected envmap).** Requires WebGPU + node-material path; deferred to `M21-webgpu-spike`.
- **PMREM prefilter on every update.** Cost is significant (multi-pass downsample chain). Mipmap-cube-RT is the simpler v0; PMREM lands later when a high-roughness reflective material asks for it (`REFLECTION-prefilter`).

## Notes

Skill memo: `docs/agent/skills/vfx-authoring.md`. Doctor surface: `engine doctor` → `Reflections:` section.
