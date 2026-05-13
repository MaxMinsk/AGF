# Spike: Three.js Bootstrap

## Goal

Confirm the smallest renderer adapter shape for Sprint 1.

## Proposed Experiment

- Create a canvas.
- Create `WebGLRenderer`, scene, camera, light and cube.
- Handle resize.
- Cap device pixel ratio.
- Read `renderer.info`.
- Dispose geometry/material on teardown.

## Expected Finding

Three.js can remain entirely inside `engine/render`. ECS core only needs serializable render components such as:

```ts
type MeshRenderer = {
  mesh: "box" | "sphere" | "plane";
  material?: string;
};
```

## Recommendation

Sprint 1 should build `ThreeRenderer` with primitive meshes only. Asset loading and glTF can wait until after the vertical slice.

