// S277d KABOOM-BOMBER-OUTLINE-OCCLUDER. Per-bomber-part see-through
// silhouette. Uses the S273 `depthFunc='greater'` MeshRenderer-patch
// approach — works on WebGL AND WebGPU without the async NodeMaterial
// path that kept regressing across map restarts.
//
// Per-frame contract:
//   1. For every bomber-root entity (entity with `LimbPivots`), make
//      sure every body part has a sibling outline duplicate. Use
//      `world.hasEntity(outlineId)` as the idempotent guard — NO
//      module-level done-set, because a map restart re-uses bomber
//      ids (`player.1`, `bot.1`, …) and any done-set would skip the
//      newly-spawned bomber while its just-deleted predecessor's
//      entry was still cached.
//   2. GC: walk the outline entities, drop any whose parent bomber
//      part no longer exists.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import { bomberPuffColor } from "./bomber-palette";

const LIMB_PIVOTS: ComponentName = "LimbPivots";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const TRANSFORM: ComponentName = "Transform";

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

type MeshRendererLike = { mesh: string };
type TransformLike = { parent?: string };

export type BomberOutlineSystemOptions = {
  /** Outline opacity in [0,1]. Default 0.85. */
  opacity?: number;
};

export function createKaboomBomberOutlineSystem(
  options: BomberOutlineSystemOptions = {}
): System {
  const opacity = options.opacity ?? OUTLINE_OPACITY;
  let cachedWorld: World | undefined;
  let rootQuery: QueryHandle | undefined;
  let outlineQuery: QueryHandle | undefined;

  return {
    name: "kaboom.bomber-outline",
    frameUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        rootQuery = world.createQuery([LIMB_PIVOTS]);
        // Index outlines by their MeshRenderer + Transform so we can
        // GC orphans once the source part disappears.
        outlineQuery = world.createQuery([MESH_RENDERER, TRANSFORM]);
        cachedWorld = world;
      }

      // (1) spawn missing outline duplicates for every live bomber part.
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
          world.setComponent(outlineId, MESH_RENDERER, {
            mesh: renderer.mesh,
            color,
            transparent: true,
            opacity,
            depthFunc: "greater",
            depthWrite: false
          });
        }
      }

      // (2) GC: walk every entity whose id ends with the outline
      // suffix; if its parent Transform.parent references an entity
      // that no longer exists, remove the outline. This survives map
      // restarts cleanly because we never cache bomber-root state.
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
