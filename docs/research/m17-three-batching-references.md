# Three.js batching reference notes (S50 investigation)

Date: 2026-05-15
Source: `References/three.js/examples/*.html`

Snapshot of what Three.js's own examples show about batching primitives, in order of relevance to AGF's M17 path. Captured during Sprint 50 to plan the follow-up perf stories.

## 1. `webgl_mesh_batch.html` — InstancedMesh vs BatchedMesh side-by-side

Toggle between `InstancedMesh` and `BatchedMesh` rendering paths over the same scene. Key learnings:

- `mesh.frustumCulled = false` is used for BatchedMesh in this example because *every* object is dynamic. AGF's S50 default is `frustumCulled = true` with `recomputeBucketBoundingSphere()` after dirty frames — works because most M17 entities are static (the per-frame BatchingSystem-level dirty marker only re-walks the bucket when an instance actually moved).
- `mesh.sortObjects` + `mesh.perObjectFrustumCulled` are BatchedMesh-only knobs. The killer feature is **per-object** frustum culling — Three.js iterates each batched instance, tests its individual AABB against the camera frustum, and skips outside ones. InstancedMesh's `frustumCulled` is all-or-nothing on the whole mesh.
- `mesh.setCustomSort(fn)` lets you front-to-back sort instances each frame for early-Z rejection. Less relevant for shadows-bench (cascade passes don't use depth-prepass) but worth knowing.

**Takeaway:** for scenes where instances are spread across a large bounding sphere (shadows-bench: ±50 units, sphere radius ~55) the WHOLE-bucket culling rarely fires because the bucket always intersects the camera frustum. Migrating the M17 InstancedMesh path to BatchedMesh + `perObjectFrustumCulled` would cull individual instances per cascade — multiplicative win on CSM scenes.

## 2. `webgl_instancing_dynamic.html` — InstancedMesh.computeBoundingSphere

```js
// Every frame, after the per-instance matrix updates:
mesh.computeBoundingSphere();
renderer.render(scene, camera);
```

Three's InstancedMesh walks every active instance's transform to produce the enclosing sphere. Cheap (`O(instances) × 1 sqrt`). Without this call the boundingSphere stays at the geometry's local sphere, which makes `frustumCulled = true` useless when instances live outside the model-space sphere of a single instance.

**Takeaway:** AGF S50 already calls `recomputeBucketBoundingSphere()` lazily — only on the buckets that BatchingSystem marked dirty this frame. The cost is bounded by `dirtyInstancedBuckets.size × instances_in_bucket`.

## 3. `webgl_batch_lod_bvh.html` — 500k batched instances with BVH frustum culling + LOD

Uses two community packages:

- `@three.ez/batched-mesh-extensions` — overrides `BatchedMesh.prototype` to add BVH-accelerated `perObjectFrustumCulled` (TLAS / BLAS), `customSort` radix, and `setMultiDrawCount` hooks. Frustum culling on 500k instances drops to O(log n) instead of O(n).
- `three-mesh-bvh` — generic mesh BVH for raycast / culling.

Also uses `simplifyGeometriesByErrorLOD` to generate 5 LODs per batched geometry. BatchedMesh has `addGeometryLOD(geometryId, lodGeometry, distanceThreshold)` so LOD swap happens inside the GPU multi-draw.

**Takeaway:** when AGF needs 10k+ instances (the static-merge case from the earlier S42 investigation), these packages are the standard reach. Adding them is a one-time `npm i @three.ez/batched-mesh-extensions three-mesh-bvh` + `extendBatchedMeshPrototype()` at adapter init. Defer until a scene actually asks for that scale.

## 4. `webgl_instancing_scatter.html` — per-instance attributes

Establishes the pattern AGF already uses: `InstancedBufferAttribute` for per-instance color (S50 `useInstanceColor`) and per-instance offsets. No new ideas.

## 5. `webgl_instancing_raycast.html` — InstancedMesh raycast

InstancedMesh supports `raycaster.intersectObject(mesh)` natively; the intersection result includes `intersection.instanceId`. AGF already uses this in `M17-instance-picking` (S42). No action.

## 6. `webgpu_mesh_batch.html` — WebGPU MultiDrawIndirect

Same scene as #1 but on the WebGPU renderer. Showcases that BatchedMesh maps cleanly to MultiDrawIndirect when WebGPU lands. Reinforces the case for BatchedMesh as the strategic path once `M21-webgpu-spike` runs.

## Recommended sequence for AGF's perf follow-ups

1. **M17-batched-mesh-primary** — flip the M17-bucketer's `InstancedMesh` path to `BatchedMesh` + `perObjectFrustumCulled = true`. Per-instance frustum culling is the biggest win for CSM-heavy scenes (shadows-bench). Acceptance: shadows-bench drawCalls + cascade triangle count both drop without any visual regression.
2. **M17-bvh-extension** — once the BatchedMesh path is live, add `@three.ez/batched-mesh-extensions` for BVH-accelerated culling. Only worth it past ~5k instances; AGF doesn't have that scale today but it's a 30-LOC change to wire when needed.
3. **M17-lod-batched-geometry** — `BatchedMesh.addGeometryLOD` unlocks per-instance LOD inside one bucket. Pairs naturally with the existing `LOD` component once we batch GLB meshes.
4. **M17-batch-glb-meshes** + **M17-batch-material-manifests** — as recorded in BACKLOG. Bucket key promotion is the gate.
