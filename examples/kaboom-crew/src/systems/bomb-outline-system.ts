// S277i KABOOM-BOMB-OUTLINE-OCCLUDER. Per-bomb see-through silhouette
// using the engine WebGPU TSL `OutlineOccluder` path — same machinery
// as `bomber-outline-system`. The engine `render.outline-occluder`
// system swaps in a NodeMaterial that returns opacity 0 at pixels
// where the source bomb is visible (no depth delta vs the world) and
// opacity ~ 0.85 at pixels where the bomb sits behind an occluder.
// The engine flips `Object3D.visible = false` until the NodeMaterial
// loads, so the default MeshStandardMaterial never paints over the
// live bomb.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import { bomberPuffColor } from "./bomber-palette";

const BOMB: ComponentName = "Bomb";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const TRANSFORM: ComponentName = "Transform";
const OUTLINE_OCCLUDER: ComponentName = "OutlineOccluder";

const OUTLINE_SUFFIX = "outline-occluder";
const FALLBACK_COLOR = "#ff7a3a";
const OUTLINE_OPACITY = 0.85;
// Bombs are a SINGLE sphere — no intra-mesh delta to worry about, so
// we can drive softEdge much tighter than the bomber (which needs a
// wide feather to zero out the head-vs-torso bleed). The kaboom-crew
// orthographic camera + far=100 puts a hard-block-in-front-of-bomb
// occluder delta around 0.006 of linear depth; softEdge = 0.003
// saturates the smoothstep to full opacity at that distance while
// still returning 0 at the bomb's own pixels (delta = 0). Bombers
// keep the wider 0.04 to mask their intra-bomber bleed.
const OUTLINE_SOFT_EDGE = 0.003;

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
        // NodeMaterial-only: no MeshRenderer.color or depthFunc fields.
        // The engine outline-occluder-system flips visibility to false
        // until the NodeMaterial is async-loaded, so the default
        // MeshStandardMaterial never paints over the live bomb.
        world.setComponent(outlineId, MESH_RENDERER, { mesh: renderer.mesh });
        world.setComponent(outlineId, OUTLINE_OCCLUDER, {
          color,
          opacity: OUTLINE_OPACITY,
          softEdge: OUTLINE_SOFT_EDGE
        });
      }

      // GC orphan outlines whose source bomb is gone (detonation,
      // sudden-death, round reset).
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
