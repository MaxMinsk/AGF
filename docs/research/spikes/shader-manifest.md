# Spike: Shader Manifest

Status: Draft. Schema exists at `schemas/shader.schema.json`. Runtime does not consume it yet.

## Goal

Let project authors declare custom GLSL shaders as JSON manifests so the renderer (and any future inspector or asset-pipeline tool) can reason about them as data, not as ad-hoc imports.

## Proposed Shape

```json
{
  "id": "water-ripple",
  "kind": "vertex-fragment",
  "vertexSource": "runtime/shaders/water-ripple.vert.glsl",
  "fragmentSource": "runtime/shaders/water-ripple.frag.glsl",
  "uniforms": [
    { "name": "uTime", "type": "float", "default": 0.0 },
    { "name": "uAmplitude", "type": "float", "default": 0.25 }
  ],
  "fallbackMaterial": "ocean-flat"
}
```

## Proposed Runtime Flow

1. `engine check` validates the manifest against the schema and verifies that the referenced `.glsl` files exist under `assetRoot`.
2. At runtime, the renderer reads the manifest, compiles the shader and exposes the declared uniforms by name.
3. A material can opt in by setting `shader: "<shader-id>"` instead of `"standard"`.
4. If the shader fails to compile or link, the renderer falls back to the material referenced by `fallbackMaterial`, logs an `AGF_SHADER_COMPILE_FAILED` diagnostic and continues running.

## Out Of Scope For v0

- Shader hot reload (parked in `HIGH_LEVEL_BACKLOG.md`).
- Cross-platform translation (GLSL → WGSL) — assumed Three.js + WebGL2 path.
- A shader compiler integration test in CI.
- Compute shaders (`kind: "compute"` is reserved but not implemented).
- Default uniforms beyond a small set of scalar/vector/matrix/`sampler2D` types.

## Risks

- GLSL strings as paths assume access to the file at build time. Vite-friendly path patterns should be confirmed before wiring (`import shaderText from "./foo.frag.glsl?raw"` is the likely answer).
- A single AGF "shader" today maps cleanly to Three.js `ShaderMaterial`; later additions (post-FX passes, GPU particles) may need their own manifest kinds rather than overloading this one.
- Validation only covers the manifest shape, not GLSL correctness. The first compile error happens at runtime.

## Decision

Land the schema as a draft, document the flow here, and revisit when the first real custom shader use case (water, animated material on Beacon World) appears. No runtime change is required to close the spike.
