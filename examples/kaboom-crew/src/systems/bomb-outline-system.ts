// S277b KABOOM-BOMB-OUTLINE-OCCLUDER. Same idea as
// `bomber-outline-system` but for the bomb entities placed by
// `bomb-placement-system`. Each Bomb mesh gets ONE `<bombId>.outline-
// occluder` duplicate with the engine's `OutlineOccluder` component
// tinted in the owner's palette colour so the player can tell whose
// bomb is sitting behind that wall.
//
// We only spawn duplicates ONCE per bomb root (the bomb is short-lived
// — fuse + explosion takes a few seconds — so per-frame discovery
// would otherwise re-scan every alive bomb every frame). Duplicates
// inherit transforms from their bomb parent so they ride the spawn-pop
// tween + heightmap offset automatically.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import { bomberPuffColor } from "./bomber-palette";

const BOMB: ComponentName = "Bomb";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const TRANSFORM: ComponentName = "Transform";
const OUTLINE_OCCLUDER: ComponentName = "OutlineOccluder";

const OUTLINE_SUFFIX = "outline-occluder";
const FALLBACK_COLOR = "#ff7a3a"; // warm orange — clearly readable as "bomb here"
const OUTLINE_OPACITY = 0.85;
const OUTLINE_SOFT_EDGE = 0.005;

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
          // Pre-set the duplicate's MeshRenderer.color to the bomb's
          // own colour so the brief window before the engine
          // `render.outline-occluder` system swaps in the WebGPU
          // NodeMaterial paints the duplicate as a visually-identical
          // overlay (dark bomb sphere over the dark bomb), not the
          // default `#cccccc` light-grey MeshStandardMaterial which
          // user-reported as "white bombs".
          world.setComponent(outlineId, MESH_RENDERER, {
            mesh: renderer.mesh,
            color: "#1a1a1a"
          });
          world.setComponent(outlineId, OUTLINE_OCCLUDER, {
            color,
            opacity: OUTLINE_OPACITY,
            softEdge: OUTLINE_SOFT_EDGE
          });
        }
        done.add(bombId);
      }
      for (const bombId of done) {
        if (live.has(bombId)) continue;
        const outlineId = `${bombId}.${OUTLINE_SUFFIX}`;
        if (world.hasEntity(outlineId)) world.removeEntity(outlineId);
        done.delete(bombId);
      }
    }
  };
}
