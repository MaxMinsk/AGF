// S279 KABOOM-BOMBER-OUTLINE-OCCLUDER (pre-pass variant).
//
// Per bomber root (every entity that owns `LimbPivots`):
//   • walk the 10 named body parts; for each part that has a
//     `MeshRenderer`, spawn one outline duplicate
//     `<part>.outline-occluder` with the engine `OutlineOccluder`
//     component;
//   • tag the source bomber part with `OutlinePrePassExcluded` so
//     the engine `render.outline-prepass` system masks it out of the
//     depth target the outline material samples. The outline
//     duplicates also get the same tag (they have transparent +
//     depthWrite=false NodeMaterials but tagging is the
//     belt-and-braces guarantee).
//
// Idempotent against map restart: we never cache root state at module
// level, the loop keys off `world.hasEntity(outlineId)` per frame and
// the orphan-GC pass walks outline-suffixed entities, dropping any
// whose `Transform.parent` no longer resolves.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import { bomberPuffColor } from "./bomber-palette";

const LIMB_PIVOTS: ComponentName = "LimbPivots";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const TRANSFORM: ComponentName = "Transform";
const OUTLINE_OCCLUDER: ComponentName = "OutlineOccluder";
const OUTLINE_PREPASS_EXCLUDED: ComponentName = "OutlinePrePassExcluded";

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
// With the pre-pass excluding bomber meshes from the sampled depth,
// we no longer need a wide feather to mask intra-bomber bleed —
// 0.01 of NDC depth gives full silhouette opacity for any close
// occluder (a 1m hard block in front of the bomber projects to
// 0.001+ of NDC depth under the orthographic camera).
const OUTLINE_SOFT_EDGE = 0.01;

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

      // (1) spawn missing outline duplicates + tag source parts.
      for (const rootId of rootQuery!.run()) {
        const color = bomberPuffColor(world, rootId) ?? FALLBACK_COLOR;
        for (const suffix of PART_SUFFIXES) {
          const partId = `${rootId}.${suffix}`;
          if (!world.hasEntity(partId)) continue;
          const renderer = world.getComponent<MeshRendererLike>(partId, MESH_RENDERER);
          if (renderer === undefined) continue;

          // Tag the source part so the prepass excludes it from the
          // depth target the silhouette material samples.
          if (!world.hasComponent(partId, OUTLINE_PREPASS_EXCLUDED)) {
            world.setComponent(partId, OUTLINE_PREPASS_EXCLUDED, {});
          }

          const outlineId = `${partId}.${OUTLINE_SUFFIX}`;
          if (world.hasEntity(outlineId)) continue;
          world.addEntity(outlineId);
          world.setComponent(outlineId, TRANSFORM, {
            parent: partId,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          });
          world.setComponent(outlineId, MESH_RENDERER, { mesh: renderer.mesh });
          world.setComponent(outlineId, OUTLINE_OCCLUDER, { color, opacity, softEdge });
          // Outline duplicates ALSO get the prepass-excluded tag (the
          // NodeMaterial has depthWrite=false, but tagging keeps the
          // pre-pass tidy if any other system reads our depth target).
          world.setComponent(outlineId, OUTLINE_PREPASS_EXCLUDED, {});
        }
      }

      // (2) GC orphans (parent gone). Survives map restart since we
      //     never cache root identity.
      for (const id of outlineQuery!.run()) {
        if (!id.endsWith(`.${OUTLINE_SUFFIX}`)) continue;
        const transform = world.getComponent<TransformLike>(id, TRANSFORM);
        if (transform?.parent === undefined) continue;
        if (!world.hasEntity(transform.parent)) world.removeEntity(id);
      }
    }
  };
}
