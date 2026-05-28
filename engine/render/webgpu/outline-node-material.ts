// S186 ENGINE-OUTLINE-NODE-MATERIAL. TSL NodeMaterial that emits an
// emissive colour ONLY where the current fragment is occluded by the
// scene depth captured in `depthTexture` (typically the colour-less
// pre-pass written via S185's `renderSceneToTarget`).
//
// Usage (kaboom integration lands in S187):
//   1. acquireRenderTarget({ width, height, depthTexture: true })
//   2. each frame, BEFORE main render:
//      renderSceneToTarget(rt, sceneWithoutBombers, camera)
//   3. on the bomber outline meshes: `mesh.material =
//      await createOutlineOccluderMaterial({ depthTexture: rtDepth,
//        color: palette.head, opacity: 0.85 })`
//   4. main render proceeds normally. Outline material samples the
//      pre-pass depth at screenUV, compares with its own NDC depth,
//      emits colour when occluded.
//
// WebGPU-only. The TSL graph used here has no direct WebGL fallback
// — `createOutlineOccluderMaterial` throws if the runtime's renderer
// kind is `webgl`. Projects gate accordingly.

import type { DepthTexture, Material } from "three";

export type OutlineOccluderOptions = {
  /** Depth texture captured by a pre-pass `renderSceneToTarget`. */
  depthTexture: DepthTexture;
  /** Emissive outline colour. Hex string ('#ff8800') or numeric. */
  color: string | number;
  /** Opacity multiplier in [0,1]. Default 0.85. */
  opacity?: number;
  /** Soft fade window in NDC depth units; widens the occluded->visible
   *  transition so the silhouette has a slight feather. Default 0.01. */
  softEdge?: number;
};

/**
 * Returns a NodeMaterial that renders the outline-occluder effect.
 * Async because three/tsl + three/webgpu are loaded lazily — keeps
 * WebGL-only projects from paying the ~145KB three/webgpu cost.
 *
 * The material:
 *   - has `transparent: true` + `depthWrite: false` so it composes
 *     against the main scene without clobbering the depth buffer;
 *   - has `depthTest: false` because we run our OWN depth test inside
 *     the fragment graph against the pre-pass depthTexture (the main
 *     scene's depth would let the outline write only where the
 *     bomber's own front-facing pixel is closer than its own back —
 *     not the behaviour we want);
 *   - emits 0 alpha where own NDC depth <= sampled scene depth (i.e.
 *     bomber is in front of or at the scene depth — visible) and
 *     emits `opacity` alpha where own depth > sampled (occluded).
 */
export async function createOutlineOccluderMaterial(
  opts: OutlineOccluderOptions
): Promise<Material> {
  const [tsl, webgpu] = await Promise.all([
    import("three/tsl"),
    import("three/webgpu")
  ]);

  const t = tsl as unknown as TslFactories;
  const wg = webgpu as unknown as { MeshBasicNodeMaterial: new () => Material & NodeMaterialFields };

  const material = new wg.MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  // We compare depths ourselves in the fragment graph, so don't let
  // three.js's standard depth test cull the outline before we get there.
  material.depthTest = false;

  const opacity = opts.opacity ?? 0.85;
  const softEdge = opts.softEdge ?? 0.01;

  // Sample the pre-pass depth at this fragment's screen position.
  const sampled = t.texture(opts.depthTexture, t.screenUV);
  const sceneDepth = sampled.r;

  // Current fragment's NDC depth. `screenCoordinate.z` reads gl_FragCoord.z
  // equivalent in TSL — it's the depth in NDC [0,1] post-projection.
  const myDepth = t.screenCoordinate.z;

  // Occluded when myDepth (further from camera) > sceneDepth (closer).
  // Use smoothstep for a soft feather across `softEdge` NDC units.
  const occluded = t.smoothstep(t.float(0), t.float(softEdge), myDepth.sub(sceneDepth));

  material.colorNode = t.color(opts.color);
  material.opacityNode = occluded.mul(t.float(opacity));

  return material;
}

/**
 * Minimal structural shape of the TSL factories we need. Three.js's
 * `three/tsl` entrypoint has no published types as of r0.184; we type
 * what we use structurally so call sites don't scatter `as unknown`.
 */
type TslNode = {
  readonly r: TslNode;
  readonly z: TslNode;
  add(other: TslNode | number): TslNode;
  sub(other: TslNode | number): TslNode;
  mul(other: TslNode | number): TslNode;
};

type TslFactories = {
  texture(map: DepthTexture, uv: TslNode): TslNode;
  screenUV: TslNode;
  screenCoordinate: TslNode;
  color(input: string | number): TslNode;
  float(value: number): TslNode;
  smoothstep(low: TslNode, high: TslNode, value: TslNode): TslNode;
};

type NodeMaterialFields = {
  colorNode?: unknown;
  opacityNode?: unknown;
};
