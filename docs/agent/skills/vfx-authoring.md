# Skill: vfx-authoring

## Trigger

Use when adding or tuning the post-processing chain, HDR / grounded sky, reflection probes, SSAO or colour grading on an AGF project. Pair with [`material-authoring.md`](material-authoring.md) for the per-material side and [`scene-authoring.md`](scene-authoring.md) for the per-entity side.

## What ships in v1 (S57 + S58 + S59)

| Feature | Where | Tuning |
|---|---|---|
| HDR environment + IBL | `scene.environment.kind: "hdr"` | `intensity` |
| HDR as sky | `scene.environment.asBackground: true` | `backgroundBlurriness` |
| Grounded sky + shadow catcher | `scene.environment.groundedSkybox: { height, radius }` | Plane uses `ShadowMaterial(opacity: 0.6)` |
| Reflection probe (per object) | `ReflectionProbe` + `EnvmapBinding` components | `size` (128/256/512), `updateRate` Hz, `prefilter` (mipmap / pmrem), `excludeEntities` |
| Planar mirror (water / floor) | `PlanarMirror` component | `width × height` (world), `resolution` (256/512/1024/2048), `color` tint |
| SSAO | `project.render.post: [{ kind: "ssao", radius?, intensity?, kernelSize? }]` | Default kernel 32, radius 0.5 |
| Colour-grade LUT | `project.render.post: [{ kind: "color-lut", file, intensity? }]` | `.cube` LUT under `assetRoot` |
| Bloom | `project.render.post: [{ kind: "bloom", strength?, radius?, threshold? }]` | Strength 0.3–0.6; threshold > 0.9 for hero highlights only |
| FXAA | `project.render.post: [{ kind: "fxaa" }]` | No knobs |
| Tone mapping | `project.render.color.toneMapping` | `none / linear / reinhard / cineon / aces-filmic / agx` |
| Exposure | `project.render.color.exposure` | Scalar before tone-mapping |
| Transmission pre-pass scale | `project.render.color.transmissionResolutionScale` | 0..1; lower halves transmission cost |

## When to add what

- **HDR with `asBackground: true`** — every PBR scene benefits. The HDR drives IBL through PMREM, and `asBackground` makes the sky visible. `backgroundBlurriness: 0.3` reads as a noticeable defocus and hides any seam at the horizon for HDRs that don't have a full hemisphere.
- **`groundedSkybox: { height, radius }`** — when the sky meets the floor visibly (any HDR scene with the camera below the horizon). The runtime mounts the curved-bottom sky mesh + an invisible `ShadowMaterial` shadow-catcher at the same height; shadows from dynamic casters fall on the virtual ground, the HDR shows through everywhere else.
- **`ReflectionProbe` + `EnvmapBinding`** — a hero metallic / glossy object needs to reflect surrounding geometry, not just the HDR. 256² @ 60 Hz costs about 4× one regular frame's render. Always set `excludeEntities` to at least the probe's own owner so the probe doesn't see itself.
- **`ReflectionProbe.prefilter: "pmrem"`** — opt-in GGX prefilter via `PMREMGenerator.fromCubemap` after every cube capture. Default `"mipmap"` (cheap auto-mipmap) reads fine up to `roughness ≈ 0.3`; past that you can see the box-filter artefacts ("offset" smeared reflections). PMREM adds ~4–6× the cost of a single cube face render per probe update, so always pair with a low `updateRate` (15 Hz). Material-bench's centre chrome uses `prefilter: "pmrem"` at `roughness: 0.35` as the worked example.
- **`PlanarMirror`** — `Reflector`-backed water surface / lobby floor / smooth glass tile. The runtime spawns a flat mesh (width × height) at the entity's `LocalToWorld` and renders the scene reflected across it into a private RT every frame. Cost is one extra full-scene render per mirror per frame; keep the resolution modest (512 is the sweet spot for water). `color: "#88aaff"` is a typical cool tint; don't drift too far from neutral or the mirror illusion breaks. Cannot reflect "behind" surfaces — use a `ReflectionProbe` for curved hero objects. See `examples/water-bench/` for the worked example.
- **SSAO** — adds soft contact darkening; matters most for ambient-lit interior scenes. Cost ~5–10 % of base render at default settings. Set `radius: 0.3` for tight contacts, `0.8+` for broad indirect occlusion.
- **Colour-grade LUT** — final-pass mood control. Drop a `.cube` LUT under `assets/runtime/luts/` and reference its project-relative path. Intensity 0..1 blends with the un-graded look.
- **Bloom** — only when there are HDR-bright pixels to bloom from. Adding bloom to an SDR scene is a waste of a pass. Default `threshold: 0.85` includes a lot of "moderately bright" pixels; for hero-highlight-only bloom (chrome rim lights, point-light flares) raise to `0.92+`. material-bench ships `{ strength: 0.35, radius: 0.55, threshold: 0.92 }` as a good reference.

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

## Worked example — PMREM prefilter (S59)

The default `prefilter: "mipmap"` reads fine for mirror-like surfaces (roughness < 0.3). For a glossy-but-rough surface (chrome at 0.35 / brushed steel at 0.5 / brushed copper at 0.4), opt into `pmrem` so envmap sampling reads from a physically-correct GGX prefilter chain:

```jsonc
// scenes/start.scene.json
"sphere.centre": {
  "components": {
    "MeshRenderer": { "mesh": "sphere", "material": "runtime/materials/m0-chrome.material.json" },
    "ReflectionProbe": {
      "size": 128,
      "updateRate": 15,        // halve the rate when enabling pmrem
      "prefilter": "pmrem",
      "excludeEntities": ["sphere.centre", "pedestal.centre"]
    },
    "EnvmapBinding": { "probe": "sphere.centre" }
  }
}
```

Watch `__agf.rendererInfo().prefilterMs` — that's the per-frame PMREM regen cost. On a 128² probe at 15 Hz expect ~1–2 ms; at 256² @ 30 Hz expect 8–15 ms (and you should rethink).

## Worked example — Reflector planar mirror (S59)

`PlanarMirror` declares a flat surface whose normal is the entity's local +Z. Rotate the entity to point the normal where you want — for a horizontal water surface, `rotation: [-90, 0, 0]` (rotate +Z to point at +Y):

```jsonc
"water": {
  "components": {
    "Transform": {
      "position": [0, 0, 0],
      "rotation": [-90, 0, 0],
      "scale": [1, 1, 1]
    },
    "PlanarMirror": {
      "width": 30,
      "height": 30,
      "resolution": 512,
      "color": "#a8c6ff"
    }
  }
}
```

Camera position relative to the mirror plane decides what's visible — Reflector clips everything behind the mirror's near side. If your reflection is empty, check whether the mirror's normal actually faces the camera. Try `examples/water-bench/` to see the worked example live.

## Worked example — Bloom (S59 — small)

Bloom needs an HDR-bright source pixel to be interesting. Combined with `toneMapping: "aces-filmic"` (which compresses very-bright pixels), set the threshold above where regular surfaces sit:

```jsonc
// project.json
"render": {
  "color": { "toneMapping": "aces-filmic", "exposure": 1.0 },
  "post": [
    { "kind": "bloom", "strength": 0.35, "radius": 0.55, "threshold": 0.92 }
  ]
}
```

Threshold sweep: 0.85 (default, "everything bloom"), 0.92 (hero highlights only — chrome rim lights, point-light flares), 0.98 (extreme bright source like a sun disc). Strength > 0.6 reads as "kitschy bloom" on a PBR scene.

## Common pitfalls

- **`groundedSkybox` without an HDR / cube env.** Helper only works with PBR cubemap envs — `kind: "generated"` and `kind: "none"` skip it. Engine doctor's `Shadows` section will note the missing env if you forget.
- **`groundedSkybox.height <= 0`.** The three.js helper throws on non-positive `height` (it expects the HDR's "camera height" magnify factor). The runtime translates AGF's `height` (world Y of the floor) to a positive projection factor internally + positions the mesh — but if you author the field directly anywhere, make sure your downstream tooling uses the AGF semantic. Floor world Y is set via `groundedSkybox.height`; pass any real number (including negatives).
- **`groundedSkybox` fed the PMREM cubemap.** GroundedSkybox samples with `MeshBasicMaterial`; the prefiltered cube is mip-blurred and projects soft. The runtime feeds the raw equirect HDR — don't bypass.
- **Reflection probe sees itself.** Always set `excludeEntities: [<owner-id>]`. The system auto-adds the owner but it can't know about adjacent props (the pedestal under the chrome ball, the platform a probe rides on). List them too.
- **CubeCamera world matrix stale.** Three.js auto-refreshes the cube cam's world matrix in `update()` **only when `parent === null`**. The AGF runtime does NOT add cube cams to the scene graph so this works; if you re-attach a cube cam, call `updateMatrixWorld(true)` before `update()`.
- **Reflection at `roughness > 0` looks "offset".** Three.js's standard envmap sampling needs a proper mip chain to read at roughness > 0. The cube render target ships with `generateMipmaps: true, minFilter: LinearMipmapLinearFilter`; mirror-like surfaces (`roughness < 0.1`) read mip 0 and look correct, moderate-roughness (~0.2–0.3) reads softer mips. For physically-correct PBR-roughness reflection at higher roughness, opt into `ReflectionProbe.prefilter: "pmrem"` (S59) — runs `PMREMGenerator.fromCubemap` after every cube capture. Pair with a low `updateRate` (15 Hz max) since each PMREM regen runs a multi-pass downsample chain.
- **`PlanarMirror` reflects an empty scene.** Reflector clips everything behind the mirror's near side (the side the local +Z normal points away from). Rotate the entity so its local +Z faces the geometry you want reflected. For a horizontal water surface looking up, that's `rotation: [-90, 0, 0]`. Symptom: deep tinted plane, no scene content — flip the rotation 180°.
- **`PlanarMirror` at high `resolution` tanks FPS.** Each mirror runs a full-scene render every frame at its resolution. A single 1024² mirror is roughly 4× the cost of a 512². Default `512` is the sweet spot for water; go higher only for a hero mirror that fills the frame.
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
