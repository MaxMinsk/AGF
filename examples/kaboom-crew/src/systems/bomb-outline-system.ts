// S280 KABOOM-BOMB-OUTLINE-OCCLUDER. Per-bomb see-through silhouette
// on top of the S278/S279 pre-pass infrastructure.
//
// For each `Bomb` mesh:
//   • spawn `<bombId>.outline-occluder` (sibling-style child carrying
//     `OutlineOccluder` — the engine `render.outline-occluder` system
//     swaps a WebGPU TSL NodeMaterial in);
//   • tag the bomb itself with `OutlinePrePassExcluded` so the engine
//     prepass excludes it from the depth target the silhouette
//     samples (otherwise the bomb's own depth would zero the
//     smoothstep at every bomb pixel — i.e. silhouette only visible
//     where the bomb does NOT cover, which is nowhere useful).
//
// The outline duplicate also gets `OutlinePrePassExcluded` so its
// transparent material never contributes to the depth target.
//
// Survives map restart (no module-level cache of bomb identity).
// GC pass drops orphan outlines whose source bomb was removed by
// detonation, sudden-death, or round reset.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import { bomberPuffColor } from "./bomber-palette";

const BOMB: ComponentName = "Bomb";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const TRANSFORM: ComponentName = "Transform";
const OUTLINE_OCCLUDER: ComponentName = "OutlineOccluder";
const OUTLINE_PREPASS_EXCLUDED: ComponentName = "OutlinePrePassExcluded";

const OUTLINE_SUFFIX = "outline-occluder";
const FALLBACK_COLOR = "#ff7a3a";
const OUTLINE_OPACITY = 0.85;
// Tight feather — same as bombers. With the bomb excluded from the
// prepass depth, any cross-wall delta saturates the smoothstep to
// full opacity.
const OUTLINE_SOFT_EDGE = 0.01;

type MeshRendererLike = { mesh: string };
type BombLike = { ownerId?: string };
type TransformLike = { parent?: string };

export function createKaboomBombOutlineSystem(): System {
  let cachedWorld: World | undefined;
  let bombQuery: QueryHandle | undefined;
  let outlineQuery: QueryHandle | undefined;

  return {
    name: "kaboom.bomb-outline",
    frameUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        bombQuery = world.createQuery([BOMB, MESH_RENDERER]);
        outlineQuery = world.createQuery([MESH_RENDERER, TRANSFORM]);
        cachedWorld = world;
      }

      for (const bombId of bombQuery!.run()) {
        const renderer = world.getComponent<MeshRendererLike>(bombId, MESH_RENDERER);
        if (renderer === undefined) continue;

        // Tag the source bomb so the prepass excludes it.
        if (!world.hasComponent(bombId, OUTLINE_PREPASS_EXCLUDED)) {
          world.setComponent(bombId, OUTLINE_PREPASS_EXCLUDED, {});
        }

        const outlineId = `${bombId}.${OUTLINE_SUFFIX}`;
        if (world.hasEntity(outlineId)) continue;
        const bomb = world.getComponent<BombLike>(bombId, BOMB);
        const color = (bomb?.ownerId !== undefined
          ? bomberPuffColor(world, bomb.ownerId)
          : undefined) ?? FALLBACK_COLOR;
        world.addEntity(outlineId);
        world.setComponent(outlineId, TRANSFORM, {
          parent: bombId,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        });
        world.setComponent(outlineId, MESH_RENDERER, { mesh: renderer.mesh });
        world.setComponent(outlineId, OUTLINE_OCCLUDER, {
          color,
          opacity: OUTLINE_OPACITY,
          softEdge: OUTLINE_SOFT_EDGE
        });
        world.setComponent(outlineId, OUTLINE_PREPASS_EXCLUDED, {});
      }

      // GC orphan outlines whose source bomb is gone.
      for (const id of outlineQuery!.run()) {
        if (!id.endsWith(`.${OUTLINE_SUFFIX}`)) continue;
        const transform = world.getComponent<TransformLike>(id, TRANSFORM);
        if (transform?.parent === undefined) continue;
        if (!world.hasEntity(transform.parent)) world.removeEntity(id);
      }
    }
  };
}
