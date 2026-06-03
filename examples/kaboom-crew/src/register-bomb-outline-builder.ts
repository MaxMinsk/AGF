// S280 — register a procedural-mesh builder for the bomb outline
// duplicate's geometry. We can't reuse the built-in `"sphere"`
// primitive on the outline duplicate: the engine batching system
// auto-buckets primitive meshes into a shared InstancedMesh, which
// strips per-entity `RenderMeshHandle` and prevents the engine
// `render.outline-occluder` system's WebGPU NodeMaterial swap from
// landing on the outline. A procedural mesh ref bypasses auto-batch
// (only primitives are auto-bucketed), so the outline travels the
// per-entity path and the silhouette material gets applied.

import { SphereGeometry } from "three";

import type { ThreeRenderer } from "../../../engine/render/three-renderer";

export const BOMB_OUTLINE_MESH_KEY = "bomb-outline-sphere";

export function registerKaboomBombOutlineBuilder(renderer: ThreeRenderer): void {
  const registry = renderer.proceduralMeshRegistry();
  registry.register(BOMB_OUTLINE_MESH_KEY, () => new SphereGeometry(0.5, 32, 20));
}
