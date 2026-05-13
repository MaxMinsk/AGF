# Three.js Best Practices

Sprint 0 note. Focus: rules for the first renderer adapter.

## Rules We Will Follow

- Three.js stays behind `engine/render`.
- ECS components store serializable data, not `THREE.Object3D`, `Material`, `Geometry` or `Texture` instances.
- The render adapter owns Three.js resource lifecycle.
- Every geometry, material and texture created by the adapter must have an ownership path and a `dispose` path.
- `renderer.info` should feed debug/perf metrics: draw calls, triangles, geometries and textures.
- glTF/GLB is the preferred 3D asset format once asset loading starts.
- Primitive meshes are enough for Sprint 1: `box`, `sphere`, `plane`.
- Custom shaders start with `ShaderMaterial`, typed uniforms and a fallback material.
- Development renderer should keep shader error reporting enabled.

## Renderer Adapter Checklist

- Create renderer with explicit canvas ownership.
- Handle resize and device pixel ratio centrally.
- Map ECS `Transform` to Three.js object transforms.
- Keep a lookup from entity id to render object inside the adapter.
- Dispose removed entity render resources.
- Expose debug stats without exposing Three.js to core systems.
- Keep camera creation component-driven.

## Open Questions

- Exact pixel ratio cap for low-end mobile.
- When to introduce instancing versus merged geometry.
- Whether 2D sprites should use Three.js planes first or a PixiJS adapter later.
- Shader file loading strategy under Vite for HMR.

## Sources

- Three.js cleanup: https://threejs.org/manual/en/cleanup.html
- Three.js optimizing lots of objects: https://threejs.org/manual/en/optimize-lots-of-objects.html
- Three.js glTF loading: https://threejs.org/manual/en/load-gltf.html
- Three.js `WebGLRenderer`: https://threejs.org/docs/pages/WebGLRenderer.html
- Three.js `ShaderMaterial`: https://threejs.org/docs/pages/ShaderMaterial.html

