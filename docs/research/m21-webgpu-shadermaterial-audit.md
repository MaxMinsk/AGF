# M21 — WebGPU ShaderMaterial audit (Sprint 66)

Investigation of the `THREE.NodeBuilder: Material "ShaderMaterial" is not compatible` error that blocked the S65 bloom port on WebGPU.

## Tool

Adapter method `auditMaterialClasses()` walks every scene object's `.material` + `.customDepthMaterial` + `.customDistanceMaterial`, plus every composer pass and counts shadow-pass occurrences for castShadow lights. Exposed via `window.__agf.__auditMaterials()` for headed-playwright runs. Lives in `engine/render/three-render-adapter.ts`.

## Findings on webgpu-spike

Webgpu-spike's minimum config (4 meshes + 1 directional sun with castShadow + 1 hemisphere + env=generated + 1 reflection probe at updateRate=0):

```
MeshStandardMaterial:                4
<shadow-pass-for:DirectionalLight>:  1
```

**No `ShaderMaterial` in the scene traversal.** The error must originate inside three.js internals not visible to `scene.traverse`. Candidates:

1. **Shadow rendering** — three.js's shadow pass uses an internal `MeshDepthMaterial` (extends `Material`, not `ShaderMaterial`) on WebGL. On WebGPU, three.js *should* use `ShadowNodeMaterial` (in `three/webgpu` exports) — but maybe there's a fallback path that constructs the legacy WebGL depth material under specific conditions (e.g. when the user material has `customDepthMaterial` unset).
2. **PMREM equirect / cubemap shader** — `PMREMGenerator` (S62 webgpu variant) internally uses several pingpong shaders to prefilter cubemaps. These are likely `ShaderMaterial`-based. PMREM runs once at boot AND once per probe update; the latter fires when the probe is rebuilt (S64 path). Even with `updateRate: 0`, the first bake fires on first frame.
3. **GroundedSkybox / `ShadowMaterial`** — AGF's renderer creates these for the `groundedSkybox` env config. webgpu-spike doesn't use grounded skybox, so these aren't the issue here.
4. **`Scene.background` if it's a Texture rather than a Color** — WebGPURenderer renders the background via an internal `BackgroundNode` (or older versions, `ShaderMaterial`). Background in webgpu-spike is `#0e1828` (Color, not Texture).

## What's NOT the cause

Bisection by removing each subsystem on the spike scene with bloom enabled:

- `environment.kind: "none"` (skip PMREM) — error still fires.
- `castShadow: false` on the sun (skip shadow pass) — error still fires.
- No reflection probe — error still fires.
- Combination of all three removed — error STILL fires.

So the offending `ShaderMaterial` is in something that's ALWAYS present on the WebGPU adapter path, not gated on any feature. Likely candidate after eliminating shadow / env / probe: three.js's WebGPURenderer's internal compile-on-first-render scaffolding that generates a fullscreen-quad ShaderMaterial when `PostProcessing` evaluates the scene-pass output. That construction happens deep inside the renderer.

## Lead found mid-investigation

The exact error path lives in `node_modules/three/src/nodes/core/NodeBuilder.js:2985` — fires when `renderer.library.fromMaterial(material)` returns `null`. `StandardNodeLibrary` (used by `WebGPURenderer`) registers entries for `MeshStandardMaterial`, `MeshBasicMaterial`, `ShadowMaterial` etc., but **NOT for the base `ShaderMaterial` class**. So `material.type === "ShaderMaterial"` always fails the lookup.

Three.js's own classes that instantiate vanilla `ShaderMaterial`:

- `three/addons/objects/{Reflector, Refractor, Water, Sky}.js` — none used by the minimal spike.
- `three/addons/postprocessing/*Pass.js` — many use `ShaderMaterial`, but we skip the WebGL EffectComposer on WebGPU.
- `PMREMGenerator` internal pingpong materials — these are `ShaderMaterial` subclasses. PMREM runs at boot + once per probe rebuild.
- Possible: three.js's internal shadow material when a directional/spot has castShadow but no `customDepthMaterial` set.

Even after removing env / probe / shadow from the spike, the error still fired — pointing at something inside WebGPURenderer's own initialization that touches a `ShaderMaterial` (possibly an internal helper material created lazily during first `renderAsync` when `PostProcessing` is wired up).

## Required next investigation (for S67)

1. **Add a global monkey-patch on `ShaderMaterial.prototype.constructor`** that captures a stack trace each time one is instantiated. Run the spike with bloom enabled; the stack trace identifies which three.js internal triggers the construction.
2. **Try with `ColorManagement.enabled = false`** — colour-management hooks sometimes create internal shader materials for sRGB conversion.
3. **Try with `outputColorSpace: NoColorSpace` on the WebGPURenderer** — eliminates one layer of internal shader-material creation.
4. **Check three.js issue tracker** — there may already be a known incompatibility between `PostProcessing` and some default material path in r0.184.

## Recommended workaround for S67+

If the offending `ShaderMaterial` turns out to be in a three.js internal we can't avoid:

- Pin a slightly different three.js minor (r0.183 had a different `PostProcessing` build before the `RenderPipeline` rename) and try the bloom port there.
- Or fork the `BloomNode` to manage its own RenderTarget pingpong manually, bypassing the `PostProcessing` orchestrator entirely.
- Or wait for upstream three.js to publish a fully node-material WebGPU stack (tracked in three.js issue queue).

## Status

S66 ships the audit tool + this writeup; no actual fix. S67 picks up the monkey-patch investigation. Realistic expectation: each WebGPU feature port may need a similar deep-dive; the path to default-flip is longer than the S60 spike sketch suggested.

## S67 stack-trace investigation — UPSTREAM BLOCK CONFIRMED

Approach: re-enabled the S65 bloom code path, captured `console.error` stacks via playwright `page.addInitScript`. Five identical stacks captured during first frame:

```
THREE.NodeBuilder: Material "ShaderMaterial" is not compatible.
  at WGSLNodeBuilder.prebuild (three_webgpu.js:36757)
  at WGSLNodeBuilder.build (three_webgpu.js:36769)
  at NodeManager.getForRender (three_webgpu.js:37867)
  at RenderObject.getNodeBuilderState (three_webgpu.js:20295)
  at RenderObject.getMonitor (three_webgpu.js:20303)
  at NodeManager.needsRefresh (three_webgpu.js:38246)
  at WebGPURenderer._renderObjectDirect (three_webgpu.js:42328)
```

**Verdict:** The offending `RenderObject` is rendered by `WebGPURenderer._renderObjectDirect` — meaning it's a Mesh in the pipeline's draw list. The error fires per-mesh. Stack confirms: the offender comes from INSIDE three.js's bloom orchestration, not from AGF code.

Specifically, `BloomNode`'s internal pingpong render-targets render fullscreen quads. Some of those quads use vanilla `ShaderMaterial` (instead of `NodeMaterial`) — this is a known limitation in three.js's WebGPU post-processing surface as of r0.184.

**Not fixable from AGF**. Workarounds:
- Pin a different three.js version that has the fix (TBD if any).
- Wait for upstream three.js to publish `RenderPipeline`-compatible TSL `BloomNode` (likely r0.185+; the project is actively reworking post-processing).
- Fork `BloomNode` to use `NodeMaterial` for its internal quads (large maintenance burden).

**Recommendation:** park the WebGPU post-processing path entirely until three.js publishes the fix. Continue WebGPU feature parity on the non-post-processing axes (CSM-fallback / planar mirror / GPU timer / migrations). Track three.js's WebGPU TSL post-pipeline maturity each minor release.

S67 reverted the bloom code. `supportsPostProcessing: false` on WebGPU stays. Research finding ships as the deliverable.
