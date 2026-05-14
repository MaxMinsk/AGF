# M21-tsl-investigate

Date: 2026-05-14
Owner: M21 Phase 2 renderer

## Question

Should AGF adopt **Three.js TSL** (Three.js Shading Language) / `NodeMaterial` as the runtime path for custom material authoring — replacing the inline-GLSL approach shipped in S40/S41 (`shader: "custom"` + `vertexShader` / `fragmentShader` source strings)?

TSL is a node-graph DSL that compiles to either WebGL **or** WebGPU shaders from the same source. The pitch: agents author shaders in one place; the engine emits the right backend at build time.

## State of the toolchain (May 2026)

- TSL ships in Three.js as `three/src/nodes/`. It's flagged "experimental" in r184 changelog but actively developed; the WebGPU renderer (`WebGPURenderer`) uses TSL exclusively.
- WebGL still supports both `MeshStandardNodeMaterial` (TSL-driven) and the legacy `MeshStandardMaterial` (GLSL chunk-based). Mixing the two in the same scene is supported with a small fixed cost.
- Three's example gallery has ~20 TSL demos. Documentation is sparse; the canonical reference is reading the example sources + `three/src/nodes/Nodes.js`.

## Pros for AGF

1. **One source, two backends.** When AGF lands the `M21-webgpu-spike`, TSL-authored materials work on both renderers without forking. Direct GLSL forks would need WGSL twins.
2. **Composable nodes.** TSL exposes `MathNode`, `OperatorNode`, `TextureNode`, etc. that compose at the JSON level — easier for agents to assemble than emitting raw GLSL.
3. **Type-safer than strings.** A TSL `texture(map).rgb.mul(uniform("tint"))` carries Object types in TypeScript; misspelling a uniform name surfaces at compile time, not at shader-link time in a dev-tools error.

## Cons / risks

1. **Stability churn.** TSL is "experimental"; node API surface has shifted across the last 3 minor releases. AGF would need to pin a version + track upstream rewrites.
2. **Schema explosion.** Encoding a node graph in JSON is verbose. A simple `color.mul(uniform("tint")).pow(2.2)` chain becomes ~10 nested JSON nodes. Compare to the 4-line inline GLSL shipped today.
3. **Compile-time surprises.** TSL graphs that are valid in node-form sometimes fail at backend codegen on a specific GPU (driver bug). Authors don't see the generated GLSL/WGSL by default.
4. **Beacon doesn't need it.** Today's manifests cover Beacon + batch/physics/shadow-bench without any custom shader. The first real custom-shader need is the future water / fog / outline pass — none of which are scheduled.

## Recommendation

**Defer until WebGPU lands.** The single-source-two-backends pitch is the only reason to take on TSL's instability + verbosity, and that pitch only materialises after `M21-webgpu-spike` ships. Until then:

- Keep the GLSL-string `shader: "custom"` path (S40 `M21-mat-custom`).
- Keep the external-file path (S41 `M21-mat-shader-files`) as the "real" authoring shape — projects work in their editor of choice, the engine just fetches.
- When `M21-webgpu-spike` lands, re-evaluate. If WebGPU stays behind a profile flag (not the default backend), TSL stays optional.
- If TSL becomes the WebGPU default, ship a second `shader: "tsl"` kind alongside `"custom"` — both can coexist on the WebGL renderer; the WebGPU renderer would skip `"custom"` GLSL altogether.

## Out of scope here

- A TSL spike. The verdict above is "defer", so no GLSL→TSL port today.
- WGSL pipeline planning. Tracked separately under `M21-webgpu-spike`.

## Sub-decisions

- **No node-graph schema.** When TSL ships in AGF it will use a TS-side builder (`buildTslMaterial({ ... })`) producing the same `MaterialPatch` shape the renderer already consumes — not a JSON node graph. The JSON manifest will just carry the builder's id + parameters.
