# Reflection probes / dynamic reflections — investigation

Goal: figure out whether AGF should grow a "reflection probe" concept, what
that would look like under three.js, and whether the material-bench glass /
chrome / car-paint slots should pick it up.

Spec scope: investigate only. No code changes in this doc; the conclusions
feed a follow-up story if we adopt anything.

## Terminology

"Reflection probe" in the Unity / Unreal sense doesn't exist in three.js as a
named class. The closest equivalents are four separate features, each
solving a different slice of the dynamic-reflection problem:

| Feature | three.js class | Captures | Use case | Cost per update |
|---|---|---|---|---|
| **CubeCamera + WebGLCubeRenderTarget** | `THREE.CubeCamera`, `THREE.WebGLCubeRenderTarget` | Full scene as a cubemap from a point | Per-object dynamic envMap (shiny ball reflects moving world) | 6× scene render at probe resolution |
| **Reflector (planar mirror)** | `three/examples/jsm/objects/Reflector.js` | Scene mirrored across a plane | Floor / water / wall mirrors | 1× scene render at mirror resolution |
| **SSR (screen-space reflections)** | `three/examples/jsm/postprocessing/SSRPass.js` | Reflections raymarched in screen space | Cheap wet-floor / metal-table look, no need for separate geometry | 1× post-pass on G-buffer |
| **LightProbe (irradiance)** | `THREE.LightProbe`, `LightProbeGenerator.fromCubeRenderTarget` | Spherical-harmonics irradiance | Low-frequency ambient, swap in for/with `scene.environment` | One-time at bake + cheap per-frame |

Three.js native (WebGPU node-material) examples
(`webgpu_reflection*.html`) wrap the SSR / Reflector path through
`reflector()` / `mirror()` nodes, but the underlying RT mechanics are
identical to the WebGL path.

## What we already use

- **PMREM-prefiltered HDR / cube** as `scene.environment` — the only "envmap"
  any material in AGF sees today.
- **WebGLRenderer's built-in transmission pre-pass** — gives `transmission > 0`
  materials a per-frame full-scene RT to refract through. Already exposed in
  S54 BENCH-material-bench as `project.render.color.transmissionResolutionScale`.

That's it. Sharp metal reflections (`material-bench.m0-chrome`) currently see
only the static HDR sky — not the orbiting outer spheres. The user noticed
this and asked the investigation.

## Option 1 — CubeCamera per probe

The textbook three.js example (`webgl_materials_cubemap_dynamic.html`):

```js
const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.1, 1000, cubeRT);
scene.add(cubeCam);
material.envMap = cubeRT.texture;

// each frame, before scene render:
sphere.visible = false;           // hide self to avoid feedback
cubeCam.update(renderer, scene);
sphere.visible = true;
```

Pros:
- True per-direction reflections — chrome sphere sees neighbours, glass shows
  parallax, car paint clearcoat picks up colour from outer ring.
- Each probe is independent → can place one per "interesting" object.
- Works with PCF / shadow / transmission pipelines unchanged — it's just
  another camera.

Cons:
- 6× scene render per probe per update tick. At our 27 entities / shadow
  pass / transmission pre-pass it's the bulk of frame time.
- Feedback loop: the probe sees itself. Standard mitigation is
  `mesh.visible = false` around `update`, or three.js layers
  (`cubeCam.layers.set(N)` and put excluded meshes on a different layer).
- PMREM mip chain isn't free either: for blurry reflections (roughness > 0.1)
  the cubemap must be re-prefiltered each update; otherwise the reflection
  reads off mip 0 only and looks sharper than physically correct. Either
  re-run `PMREMGenerator.fromCubemap(cubeRT.texture)` per update (expensive),
  drop the resolution, or accept the sharp-only look.
- Each material that opts in needs its own `envMap` override — not just
  `scene.environment`. Three.js material code path differs slightly
  (per-material envmap overrides the scene one).

Cost model for our scene (~25 opaque meshes, 1 dir light + shadow,
transmission pre-pass already present):
- 256² cube probe, updated every frame: roughly 4–6× the
  current renderMs since each face is ~half-cost of a normal frame
  (no post-processing / tonemap apply, smaller RT).
- 128² cube probe @ 30 Hz (every other frame): probably 1.5–2× current
  renderMs — could live within the 120 fps budget if the rest stays put.
- Static prefilter (`update()` once at boot, never again) is essentially
  free per frame but loses everything dynamic — defeats the point if the
  user wants to see orbiting spheres in the centre chrome.

## Option 2 — Reflector (planar mirror)

Designed for **planar** surfaces only. The reflector inherits Mesh,
holds its own camera + RT, and on render mirrors the scene across the
plane defined by the mesh.

Pros:
- Single render pass at mirror resolution. Cheaper than CubeCamera.
- Sharp, high-quality reflections (no cubemap interpolation seams).
- Three.js has the helper in `three/examples/jsm/objects/Reflector.js`
  (~390 LOC). Already vendored under `References/three.js`.

Cons:
- Planar geometry only. Useless for spheres / car bodies / non-flat
  glass. (`material-bench` has a flat plinth that could legitimately
  use one, but it's not where the demand is.)
- Doesn't compose with `MeshPhysicalMaterial.transmission` or
  `iridescence` etc. — it sets `material.map`, not envMap.
- Mirrors are recursive: if two reflectors face each other, three.js
  doesn't auto-resolve, you get one bounce max.

Right tool for water surfaces, lobby floors, picture-frame glass.
**Wrong** tool for material-bench's chrome ball.

## Option 3 — SSR (screen-space reflections)

`SSRPass` is a post-processing step (needs `EffectComposer`). It
raymarches reflection rays through the depth buffer and samples colour
from the screen.

Pros:
- One pass, fixed cost regardless of scene complexity (sized to screen).
- Works for arbitrary surfaces — sphere, plane, animated geometry.
- No "exclude self" feedback because it reads from already-rendered
  framebuffer.

Cons:
- Only reflects what is **visible on screen**. The chrome ball can't
  show outer spheres that are behind the camera, or hidden by
  occlusion. For a circling formation this is a real gap — depending on
  camera angle the user would see half the ring reflected, half black.
- Requires AGF to wire `EffectComposer` properly. Today the post stack
  is `FXAA + bloom + OutputPass`; SSR has to slot in before
  tonemapping, needs depth + normal buffers, and competes with FXAA
  for the screen-space slot.
- Per-frame cost ~5–10 % of base render at sane raymarch settings
  (16–32 steps) at 1080p.

Reasonable mid-tier option. Worth revisiting once AGF gets a proper
G-buffer (deferred or selective pre-pass) — currently we don't expose
the depth texture to post.

## Option 4 — LightProbe

`LightProbeGenerator.fromCubeRenderTarget` projects a captured cubemap
onto SH9 (9 spherical-harmonics coefficients per RGB channel). The
result is **diffuse-only ambient**, no sharp reflection.

Pros:
- Tiny runtime cost — it's 9 vec3 uniforms.
- Captures bounce / area-light intent from baking.

Cons:
- Diffuse only. Chrome ball gets no reflection at all from this.
- Only useful when paired with another mechanism for specular
  (HDR `scene.environment` already covers specular adequately for most
  static cases).

Not the answer for material-bench. Possibly useful later for indoor
beacon-world levels that need accurate ambient without an HDR file.

## Recommended path

1. **Stop calling them "reflection probes."** In AGF parlance the closest
   primitive is "dynamic envmap." Three.js doesn't have probe placement
   tooling; we'd be reinventing Unity's terminology over a
   `CubeCamera + envMap` pair.

2. **Add a `ReflectionProbe` component** (project-local first, then promote
   to engine if a second project picks it up). Shape:

   ```ts
   type ReflectionProbe = {
     /** Cubemap render resolution. 128 / 256 / 512. */
     size: 128 | 256 | 512;
     /** Probe near / far. */
     near: number;
     far: number;
     /** Probe update cadence in Hz. 0 = once at boot, 60 = every frame, etc. */
     updateRate: 0 | 15 | 30 | 60;
     /** Which entity ids to exclude from the capture (typically the probe owner). */
     excludeEntities?: ReadonlyArray<string>;
   };
   type EnvmapBinding = {
     /** Entity id of the ReflectionProbe whose RT to bind as `material.envMap`. */
     probe: string;
   };
   ```

3. **Renderer side**: a new `ReflectionProbeSystem` runs *before* the main
   render. It walks `ReflectionProbe` entities, hides their `excludeEntities`,
   calls `cubeCam.update(renderer, scene)`, then restores visibility.
   The system holds a `WebGLCubeRenderTarget` per probe; on entity removal it
   disposes. `MaterialBindingSystem` reads `EnvmapBinding`, sets
   `material.envMap = probeRT.texture`, sets `material.envMapIntensity` per
   the manifest.

4. **PMREM consideration**: for the first iteration accept sharp-only
   reflection (no per-update prefilter) and document the limitation. A
   future story can add `roughness > 0` support by routing through
   `PMREMGenerator.fromCubemap` at a fixed cadence (probably 10 Hz, not 60).

5. **Material manifest**: optional `envMapIntensity?: number` so a clearcoat
   slot can attenuate vs the chrome slot. Already kind-of supported via
   three.js defaults at 1.0.

6. **Cost budget**: a single 256² probe @ 60 Hz on material-bench
   should fit comfortably in the 120 fps target on a desktop GPU. On
   integrated GPUs it'll likely overshoot — gate it behind a profile flag
   (`project.render.dynamicReflections: "off" | "low" | "high"`) before
   shipping.

## What to actually ship next

Two-story slice for a later sprint (not S54 — S54 still owes M3-c + the
runtime stories):

1. **REFLECTION-cube-probe** — engine `ReflectionProbe` + `EnvmapBinding`
   components, `ReflectionProbeSystem`, renderer adapter wiring,
   material-bench adopts one centred at the chrome sphere.
   Acceptance: chrome sphere visibly reflects the orbiting outer ring
   when the page is open; FPS budget stays inside `performance-budget.json`.

2. **REFLECTION-prefilter** — re-prefilter each probe's cubemap via PMREM
   on a slower cadence (10 Hz) so `roughness > 0.1` materials show
   plausibly blurry reflections. Wire `envMapIntensity` in the material
   manifest.

Total estimate: 1 small + 1 medium story. Defer planar `Reflector` /
`SSRPass` until a project actually needs them.

## Out of scope here

- `MeshReflectorMaterial` from `three-stdlib` (drei alternative) — same
  underlying mechanism as `Reflector.js`, not in AGF's vendored set.
- WebGPU node-material `reflector()` / `mirror()` — blocked on the
  `M21-webgpu-spike` backlog entry.
- Light-leak / probe-blending for moving objects walking through
  multiple probes — engine support deferred until a project has more
  than one probe per scene.

## Other "probe-shaped" things in three.js

A wider scan of `References/three.js/examples/` turned up several more
addons I want to record so we can rank them together when prioritising:

### `LightProbeGrid` — 3D irradiance volume

`examples/jsm/lighting/LightProbeGrid.js`. Bakes a regular 3D grid of
SH-projected cubemaps into a 3D texture; objects sample the volume by
world position. Three.js examples are
`webgl_lightprobes.html`, `webgl_lightprobes_complex.html` and the
`_sponza` variant.

Pros:
- Captures global-illumination-ish ambient across a volume.
- Once baked, runtime cost is one extra 3D texture lookup per fragment.
- Designed for indoor / dungeon scenes where `scene.environment` from a
  single HDR is misleading.

Cons:
- Bake step renders the entire scene at every grid cell — expensive.
  Sponza example uses ~5×5×5 = 125 probes; each is a 32² cube → 6
  faces × 125 cells = 750 scene renders at bake time. Doable on load,
  not at runtime.
- Diffuse-only (SH is low-frequency). Doesn't fix sharp reflections.
- Materials need shader-chunk surgery to actually sample the volume
  — the three.js example wires it via `onBeforeCompile`. Engine work
  to make this declarative.

Verdict: high-value for the eventual beacon-world indoor levels (cave /
ruin interiors) where one HDR can't drive every room. **Not** the answer
for material-bench. Heavy enough to justify its own epic.

### Box-Projected Cubemap (BPCEM)

WebGPU-only example: `webgpu_materials_envmaps_bpcem.html`. The example
calls `getParallaxCorrectNormal(reflectVector, boxSize, boxCenter)` and
feeds it into a node-material `envNode`. Result: a flat wall reflects
the HDR with correct parallax — looks like the room is actually in
the cubemap rather than at infinity.

Pros:
- Massively improves indoor-scene reflections on flat surfaces (floors,
  walls, lobbies) for almost-zero runtime cost — one parallax-correct
  formula in the shader, no extra render.

Cons:
- Three.js native ships it **only on the WebGPU/node-material path**
  today. WebGL would need a custom `onBeforeCompile` shader chunk to
  reproduce.
- Each "box" needs an authored bbox + centre — there's no UI for
  placing them; that's the same gap Unity solves with its "Reflection
  Probe" gizmo.

Verdict: high upside for indoor scenes, blocked behind WebGL parity work
or the WebGPU spike. Park alongside `LightProbeGrid`.

### `GroundedSkybox`

`examples/jsm/objects/GroundedSkybox.js` (~100 LOC). Wraps the HDR
equirect in a curved-bottom skybox so the sky meets a virtual ground
plane instead of dropping straight down to the horizon. Compare
`webgl_materials_envmaps_groundprojected.html` for the visual upgrade.

Pros:
- Cosmetic but huge — material-bench's plinth currently sits in
  visible black-hole space below the HDR sky line. With GroundedSkybox
  the HDR's "real" ground meets our ground plane and the scene looks
  rooted.
- One Mesh added to the scene, no extra render passes.
- Project-level boolean.

Cons:
- The HDR needs decent ground content. `venice_sunset_1k.hdr` does.
  Several other Poly Haven HDRIs are upper-hemisphere only and look
  cropped.

Verdict: tiny scope, near-instant visual win. **Top of my "do soon"
list** — see priority analysis below.

### `Sky` / `SkyMesh`

`examples/jsm/objects/Sky.js` — procedural Preetham sky (atmospheric
scatter). Useful when you don't want to ship a multi-megabyte HDR and
the project needs a runtime-tunable sun position. Beacon-world day/
night cycle would benefit. Doesn't help material-bench.

### `Water` / `Water2` / `WaterMesh`

Animated water surfaces with their own reflection RT (uses `Reflector`
under the hood) plus a refraction sample of the scene depth. Niche but
visually striking; deferred until a project asks.

## Priority analysis — which polish lands first

Ranking by visual win × low cost × likely re-use across projects. The
"cost" column is rough sprint stories at our current sprint cadence.

| # | Feature | Visual win | Cost | Re-use | Block |
|---|---|---|---|---|---|
| 1 | **GroundedSkybox** | High — kills the visible HDR-floor seam | XS (~100 LOC vendored helper + 1 schema field) | Every HDR scene | None |
| 2 | **CubeCamera reflection probe** | High — chrome / glass / car paint finally reflect each other | M (component schema + system + adapter wiring + budget gate) | Any "hero" object | None |
| 3 | **SSAO post-pass** | Medium-high — adds contact darkening, makes PBR materials read more grounded | S (vendor SSAOPass into post chain) | Every scene | None |
| 4 | **Reflector (planar mirror)** | Medium — water / lobby floor / picture-frame mirror | S (vendor + project-local helper) | Any flat reflective surface | None |
| 5 | **Color grading LUT** | Medium — final-pass mood control (cool / warm / cinematic) | S (post-pass + 3D-LUT loader) | Every scene | None |
| 6 | **Sky (procedural)** | Medium for outdoor scenes | S | beacon-world day/night | None |
| 7 | **DOF (depth of field)** | Medium for cinematic shots | M (DOF pass + focus binding) | Cinematics, splash screens | None |
| 8 | **Water / animated water** | High *if* a project has water | M | Niche | None |
| 9 | **SSR (screen-space reflections)** | Medium — fills the gap CubeCamera can't (cheap reflections everywhere, even off-screen geometry truncated) | M-L (depth buffer pipeline + post integration) | Every reflective surface | Needs G-buffer rework |
| 10 | **BPCEM (parallax-corrected envmap)** | High for indoor levels | L | Indoor scenes | WebGL shader-chunk work or WebGPU spike |
| 11 | **LightProbeGrid (irradiance volume)** | High for indoor levels with mixed lighting | L | Indoor / dungeon scenes | Material `onBeforeCompile` plumbing |
| 12 | **Motion blur** | Low-medium — only obvious in fast camera moves | L | Cinematics | None |

Concrete recommendation for AGF's next "visual fidelity" sprint (could be
a sibling sprint to S55 if M3-c lands first):

1. **GROUND-skybox** — ship `GroundedSkybox` behind
   `scene.environment.groundedSkybox: { height, radius }`. Material-bench
   adopts it. **Estimated: 1 small story.**
2. **REFLECTION-cube-probe** — dynamic per-object envmap with
   `CubeCamera`, project-local `ReflectionProbe` + `EnvmapBinding`
   components. Material-bench centre sphere adopts one. **Estimated: 1
   medium story.**
3. **POST-ssao** — `SSAOPass` vendored, wired into the existing
   composer, opt-in via `project.json#render.post`. **Estimated: 1
   small story.**
4. **POST-color-lut** — `LUTPass` + `.cube` loader. **Estimated: 1
   small story.**
5. **REFLECTION-prefilter** — re-PMREM each probe cubemap at a fixed
   cadence so blurry reflections work. **Estimated: 1 medium story.**

That's a 5-story "vfx" sprint shaped well within the 10–15 size floor —
mix this with 5 of the engine / runtime stories already on the
candidate list (idle rendering, GPU timing, etc.) for the actual S55.

The four "later" items (Reflector, Water, Sky, DOF) are valuable but
project-specific; pull them in when a specific game needs them. SSR /
BPCEM / LightProbeGrid / motion blur all need bigger plumbing — own
epics in `HIGH_LEVEL_BACKLOG.md`.

## References

- `References/three.js/examples/webgl_materials_cubemap_dynamic.html` — the
  reference example I built the cost model from.
- `References/three.js/examples/webgl_mirror.html` — `Reflector` usage.
- `References/three.js/examples/webgl_postprocessing_ssr.html` — `SSRPass`
  + `ReflectorForSSRPass`.
- `References/three.js/examples/webgl_lightprobe_cubecamera.html` — baking
  an SH `LightProbe` from a `CubeCamera`.
- `References/three.js/examples/webgl_lightprobes.html` /
  `webgl_lightprobes_sponza.html` — `LightProbeGrid` (3D irradiance
  volume) bake + helper.
- `References/three.js/examples/webgpu_materials_envmaps_bpcem.html` —
  box-projected parallax-corrected envmap (WebGPU node materials).
- `References/three.js/examples/webgl_materials_envmaps_groundprojected.html`
  — `GroundedSkybox` visual baseline.
- `References/three.js/examples/jsm/objects/Reflector.js` — vendored
  Reflector helper (~390 LOC).
- `References/three.js/examples/jsm/objects/GroundedSkybox.js` —
  vendored GroundedSkybox helper (~100 LOC).
- `References/three.js/examples/jsm/objects/Sky.js` /
  `Water.js` / `Water2.js` — vendored Sky / Water shaders.
- `References/three.js/examples/jsm/lighting/LightProbeGrid.js` —
  irradiance-volume bake helper.
- `References/three.js/examples/jsm/postprocessing/SSRPass.js` — vendored
  SSR pass.
