# Skill: vfx-authoring

## Trigger

Use when adding or tuning the post-processing chain, HDR / grounded sky, reflection probes, SSAO or colour grading on an AGF project. Pair with [`material-authoring.md`](material-authoring.md) for the per-material side and [`scene-authoring.md`](scene-authoring.md) for the per-entity side.

## What ships in v0 (S57)

| Feature | Where | Tuning |
|---|---|---|
| HDR environment + IBL | `scene.environment.kind: "hdr"` | `intensity` |
| HDR as sky | `scene.environment.asBackground: true` | `backgroundBlurriness` |
| Grounded sky + shadow catcher | `scene.environment.groundedSkybox: { height, radius }` | Plane uses `ShadowMaterial(opacity: 0.55)` |
| Reflection probe (per object) | `ReflectionProbe` + `EnvmapBinding` components | `size` (128/256/512), `updateRate` Hz, `excludeEntities` |
| SSAO | `project.render.post: [{ kind: "ssao", radius?, intensity?, kernelSize? }]` | Default kernel 32, radius 0.5 |
| Colour-grade LUT | `project.render.post: [{ kind: "color-lut", file, intensity? }]` | `.cube` LUT under `assetRoot` |
| Bloom | `project.render.post: [{ kind: "bloom", strength?, radius?, threshold? }]` | Default ACES-friendly bloom |
| FXAA | `project.render.post: [{ kind: "fxaa" }]` | No knobs |
| Tone mapping | `project.render.color.toneMapping` | `none / linear / reinhard / cineon / aces-filmic / agx` |
| Exposure | `project.render.color.exposure` | Scalar before tone-mapping |
| Transmission pre-pass scale | `project.render.color.transmissionResolutionScale` | 0..1; lower halves transmission cost |

## When to add what

- **HDR with `asBackground: true`** — every PBR scene benefits. The HDR drives IBL through PMREM, and `asBackground` makes the sky visible. `backgroundBlurriness: 0.3` reads as a noticeable defocus and hides any seam at the horizon for HDRs that don't have a full hemisphere.
- **`groundedSkybox: { height, radius }`** — when the sky meets the floor visibly (any HDR scene with the camera below the horizon). The runtime mounts the curved-bottom sky mesh + an invisible `ShadowMaterial` shadow-catcher at the same height; shadows from dynamic casters fall on the virtual ground, the HDR shows through everywhere else.
- **`ReflectionProbe` + `EnvmapBinding`** — a hero metallic / glossy object needs to reflect surrounding geometry, not just the HDR. 256² @ 60 Hz costs about 4× one regular frame's render. Always set `excludeEntities` to at least the probe's own owner so the probe doesn't see itself.
- **SSAO** — adds soft contact darkening; matters most for ambient-lit interior scenes. Cost ~5–10 % of base render at default settings. Set `radius: 0.3` for tight contacts, `0.8+` for broad indirect occlusion.
- **Colour-grade LUT** — final-pass mood control. Drop a `.cube` LUT under `assets/runtime/luts/` and reference its project-relative path. Intensity 0..1 blends with the un-graded look.
- **Bloom** — only when there are HDR-bright pixels to bloom from. Adding bloom to an SDR scene is a waste of a pass.

## Perf gotchas

- **Transmission + SSAO** — both passes effectively re-render the opaque scene. Combined on a primitive-rich scene that's not idle, expect a noticeable hit. Lower `transmissionResolutionScale` to 0.5 first; SSAO's kernel size scales linearly with cost.
- **Reflection probe + transmission** — the probe's pre-pass is itself a render, and transmission needs its own pre-pass. A 60 Hz probe + glass material is two extra renders per frame. Drop probe `updateRate` to 30 Hz for non-hero shots.
- **Bloom + LUT + SSAO + FXAA** — every pass costs. Order matters in the composer but performance scales with full-screen reads. If you're at >5 ms per frame on post alone, drop one.
- **`render.idleMode: "on-demand"` + reflection probes** — the probe owner spinning will keep the mutation counter ticking, but a fully static probe owner means the probe's contents never update. Bake-once is fine for static scenes; remove the probe for true idle.

## Worked example — material-bench (S57)

```jsonc
// scenes/start.scene.json
"environment": {
  "kind": "hdr",
  "url": "runtime/hdr/venice_sunset_1k.hdr",
  "intensity": 1.0,
  "asBackground": true,
  "backgroundBlurriness": 0.35,
  "groundedSkybox": { "height": -0.75, "radius": 60 }
}

// project.json
"render": {
  "color": { "toneMapping": "aces-filmic", "exposure": 1.0, "transmissionResolutionScale": 0.5 },
  "post": [
    { "kind": "ssao", "radius": 0.4, "intensity": 1.0 },
    { "kind": "color-lut", "file": "runtime/luts/warm.cube", "intensity": 0.6 }
  ]
}
```

The HDR drives IBL; the grounded sky + shadow catcher meet the cement-cylinder pedestals; the centre chrome sphere carries a `ReflectionProbe` so it reflects the orbiting ring; SSAO darkens the contact lines; the LUT warms the highlights by 60 %.

## Common pitfalls

- **`groundedSkybox` without an HDR / cube env.** Helper only works with PBR cubemap envs — `kind: "generated"` and `kind: "none"` skip it. Engine doctor's `Shadows` section will note the missing env if you forget.
- **Reflection probe sees itself.** Always set `excludeEntities: [<owner-id>]`. Three.js's `CubeCamera` doesn't auto-exclude.
- **LUT file path resolution.** The runtime resolves the LUT path through `AssetRegistry.urlFor` — use project-relative paths (`runtime/luts/foo.cube`), not absolute URLs.
- **`.cube` LUT not loading.** The current loader is `three/addons/loaders/LUTCubeLoader`; `.3dl` is **not** supported in v0.
- **SSAO black band at the horizon.** SSAO needs a real depth buffer; transparent surfaces (transmissive glass) confuse it. Either drop SSAO or render the glass last via `material.transparent = true` + the render-order trick.
- **Post passes ordered wrong.** SSAO before LUT before FXAA. Bloom should be early so its contribution is graded. The composer applies passes in array order; reorder the `project.render.post` array to taste.

## Doctor checks

- `engine doctor` Shadows section reports CSM cascade count + `ShadowCaster` tag counts.
- (Planned) `engine doctor` Reflections section reports declared probe count + per-probe update cadence + estimated cost.
- `engine doctor` Textures section warns when an HDR (`AGF_TEXTURE_HUGE`) or LUT-as-texture (`AGF_TEXTURE_NPOT`) is uncompressed.

## Verification

- `engine check examples/<project>` clean.
- Browser screenshot before / after each post pass.
- `__agf.frameTiming().renderMs` budget check — every post pass adds to renderMs; `__agf.rendererInfo().gpuMs` for the actual GPU side.
