// S277e KABOOM-BOMBER-OUTLINE-OCCLUDER. Per-bomber-part see-through
// silhouette using the engine's WebGPU TSL `OutlineOccluder` path.
//
// Why NodeMaterial here (and not the simpler depthFunc='greater' patch
// the bombs use): a bomber has 10 part meshes. Under depthFunc='greater'
// alone, the torso's outline-duplicate tests against the depth buffer
// AFTER the head writes its depth — at head-overlap pixels the torso's
// `torso_z > head_z` test passes and the torso silhouette bleeds
// through the head ("body shines through head" — user-reported in S273
// and again in early S277). The WebGPU TSL material samples a
// LINEAR-DEPTH viewport delta with a `softEdge` feather wide enough to
// zero out the centimetre-scale intra-bomber deltas while still
// returning full opacity at the metre-scale cross-wall delta.
//
// The duplicate stays `Object3D.visible = false` until the engine
// `render.outline-occluder` system finishes async-loading the
// NodeMaterial; without that guard the default MeshStandardMaterial
// flashes white/grey over the live source.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import { bomberPuffColor } from "./bomber-palette";

const LIMB_PIVOTS: ComponentName = "LimbPivots";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const TRANSFORM: ComponentName = "Transform";
const OUTLINE_OCCLUDER: ComponentName = "OutlineOccluder";

const PART_SUFFIXES: ReadonlyArray<string> = [
  "torso",
  "head",
  "upperArmL",
  "upperArmR",
  "forearmL",
  "forearmR",
  "upperLegL",
  "upperLegR",
  "lowerLegL",
  "lowerLegR"
];

const OUTLINE_SUFFIX = "outline-occluder";
const FALLBACK_COLOR = "#7fd6ff";
const OUTLINE_OPACITY = 0.85;
// Linear-depth feather — see `engine/render/webgpu/outline-node-material.ts`.
// Camera in kaboom-crew is ORTHOGRAPHIC at a 55° pitch with far = 100,
// so depth is linear with distance along the camera Z axis. Intra-
// bomber head-vs-torso projects to ~0.0026 of linear-depth; cross-wall
// commonly lands at 0.02 or more. softEdge = 0.02 gives near-zero
// intra-bomber bleed (smoothstep ≈ 0.05 → final opacity ≈ 0.04) while
// the cross-wall delta saturates to full opacity.
const OUTLINE_SOFT_EDGE = 0.02;

type MeshRendererLike = { mesh: string };
type TransformLike = { parent?: string };

export type BomberOutlineSystemOptions = {
  opacity?: number;
  softEdge?: number;
};

export function createKaboomBomberOutlineSystem(
  options: BomberOutlineSystemOptions = {}
): System {
  const opacity = options.opacity ?? OUTLINE_OPACITY;
  const softEdge = options.softEdge ?? OUTLINE_SOFT_EDGE;
  let cachedWorld: World | undefined;
  let rootQuery: QueryHandle | undefined;
  let outlineQuery: QueryHandle | undefined;

  return {
    name: "kaboom.bomber-outline",
    frameUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        rootQuery = world.createQuery([LIMB_PIVOTS]);
        outlineQuery = world.createQuery([MESH_RENDERER, TRANSFORM]);
        cachedWorld = world;
      }

      for (const rootId of rootQuery!.run()) {
        const color = bomberPuffColor(world, rootId) ?? FALLBACK_COLOR;
        for (const suffix of PART_SUFFIXES) {
          const partId = `${rootId}.${suffix}`;
          if (!world.hasEntity(partId)) continue;
          const renderer = world.getComponent<MeshRendererLike>(partId, MESH_RENDERER);
          if (renderer === undefined) continue;
          const outlineId = `${partId}.${OUTLINE_SUFFIX}`;
          if (world.hasEntity(outlineId)) continue;
          world.addEntity(outlineId);
          world.setComponent(outlineId, TRANSFORM, {
            parent: partId,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          });
          // WebGPU NodeMaterial path only — the engine system swaps
          // the linear-depth smoothstep TSL material in, which is the
          // only mechanism that suppresses head-vs-torso intra-bomber
          // bleed. setMeshVisible(false) on the engine side keeps the
          // duplicate hidden until the swap lands.
          world.setComponent(outlineId, MESH_RENDERER, { mesh: renderer.mesh });
          world.setComponent(outlineId, OUTLINE_OCCLUDER, { color, opacity, softEdge });
        }
      }

      // GC orphans: outline-suffixed entities whose Transform.parent
      // no longer resolves. Survives map restart cleanly because we
      // never cache root state.
      for (const id of outlineQuery!.run()) {
        if (!id.endsWith(`.${OUTLINE_SUFFIX}`)) continue;
        const transform = world.getComponent<TransformLike>(id, TRANSFORM);
        if (transform?.parent === undefined) continue;
        if (!world.hasEntity(transform.parent)) {
          world.removeEntity(id);
        }
      }
    }
  };
}
