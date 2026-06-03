// S277d KABOOM-BOMB-OUTLINE-OCCLUDER. Per-bomb see-through silhouette
// via the S273 `depthFunc='greater'` MeshRenderer-patch path. Works
// in WebGL AND WebGPU (no async material loading), and survives map
// restarts cleanly because nothing is cached at module scope — every
// frame we re-discover bombs via the ECS query and idempotently spawn
// the duplicate keyed off `world.hasEntity(outlineId)`.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import { bomberPuffColor } from "./bomber-palette";

const BOMB: ComponentName = "Bomb";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const TRANSFORM: ComponentName = "Transform";

const OUTLINE_SUFFIX = "outline-occluder";
const FALLBACK_COLOR = "#ff7a3a";
const OUTLINE_OPACITY = 0.85;

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
        world.setComponent(outlineId, MESH_RENDERER, {
          mesh: renderer.mesh,
          color,
          transparent: true,
          opacity: OUTLINE_OPACITY,
          depthFunc: "greater",
          depthWrite: false
        });
      }

      // GC orphans (source bomb removed, outline survives).
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
