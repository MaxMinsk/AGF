// S277b KABOOM-BOMB-OUTLINE-OCCLUDER. Per-bomb silhouette behind walls.
//
// Mirrors the bomber-outline-system path: a duplicate child entity per
// bomb carrying the engine `OutlineOccluder` component, which the
// engine `render.outline-occluder` system swaps out for a WebGPU TSL
// NodeMaterial. The NodeMaterial's opacityNode returns 0 at pixels
// where the bomb is visible (no depth delta against the world) — so
// the duplicate never paints over the live bomb, and the S270 red
// fuse critical-pulse + S099 wiggle stay readable.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import { bomberPuffColor } from "./bomber-palette";

const BOMB: ComponentName = "Bomb";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const TRANSFORM: ComponentName = "Transform";
const OUTLINE_OCCLUDER: ComponentName = "OutlineOccluder";

const OUTLINE_SUFFIX = "outline-occluder";
const FALLBACK_COLOR = "#ff7a3a";
// Match bomber softEdge — user-verified value where the silhouette
// reads clearly behind walls but the smoothstep zeroes out for
// fully-visible meshes.
const OUTLINE_OPACITY = 0.85;
const OUTLINE_SOFT_EDGE = 0.04;

type MeshRendererLike = { mesh: string };
type BombLike = { ownerId?: string };

export function createKaboomBombOutlineSystem(): System {
  let cachedWorld: World | undefined;
  let bombQuery: QueryHandle | undefined;
  const done = new Set<EntityId>();

  return {
    name: "kaboom.bomb-outline",
    frameUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        bombQuery = world.createQuery([BOMB, MESH_RENDERER]);
        cachedWorld = world;
        done.clear();
      }
      const live = new Set<EntityId>();
      for (const bombId of bombQuery!.run()) {
        live.add(bombId);
        if (done.has(bombId)) continue;
        const renderer = world.getComponent<MeshRendererLike>(bombId, MESH_RENDERER);
        if (renderer === undefined) continue;
        const bomb = world.getComponent<BombLike>(bombId, BOMB);
        const color = (bomb?.ownerId !== undefined
          ? bomberPuffColor(world, bomb.ownerId)
          : undefined) ?? FALLBACK_COLOR;
        const outlineId = `${bombId}.${OUTLINE_SUFFIX}`;
        if (!world.hasEntity(outlineId)) {
          world.addEntity(outlineId);
          world.setComponent(outlineId, TRANSFORM, {
            parent: bombId,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          });
          // Leave the duplicate's MeshRenderer.color UNSET so material-
          // binding doesn't keep stomping `material.color` on the
          // WebGPU NodeMaterial after it swaps in. The NodeMaterial's
          // colorNode is the sole colour authority — pre-colouring the
          // duplicate covered the live bomb in the placer's palette
          // colour (user-reported "bombs are player-coloured not
          // black"). The brief default-gray flash before NodeMaterial
          // applies is acceptable; the only short-lived hosts here
          // are mid-game bombs and the swap typically lands in 1-2
          // frames.
          world.setComponent(outlineId, MESH_RENDERER, {
            mesh: renderer.mesh
          });
          world.setComponent(outlineId, OUTLINE_OCCLUDER, {
            color,
            opacity: OUTLINE_OPACITY,
            softEdge: OUTLINE_SOFT_EDGE
          });
        }
        done.add(bombId);
      }
      // GC: when a bomb is removed (detonated / sudden-death / round
      // reset), remove the outline duplicate too. Without this the
      // duplicate keeps its MeshRenderer + dangling Transform.parent
      // and renders at a stale position.
      for (const bombId of done) {
        if (live.has(bombId)) continue;
        const outlineId = `${bombId}.${OUTLINE_SUFFIX}`;
        if (world.hasEntity(outlineId)) world.removeEntity(outlineId);
        done.delete(bombId);
      }
    }
  };
}
