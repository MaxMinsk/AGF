// S280 KABOOM-BOMB-OUTLINE-OCCLUDER. Per-bomb see-through silhouette
// on top of the S278/S279 pre-pass infrastructure.
//
// For each `Bomb` mesh, spawn `<bombId>.outline-occluder` carrying the
// engine `OutlineOccluder` component (the engine
// `render.outline-occluder` system swaps a WebGPU TSL NodeMaterial in).
//
// Mesh ref note: the outline duplicate uses
// `procedural:bomb-outline-sphere` (registered in
// `register-bomb-outline-builder.ts`) rather than the built-in
// `"sphere"` primitive. Why: kaboom-crew runs with
// `project.json#render.batching.auto: true`, so every primitive-mesh
// entity is auto-bucketed into an InstancedMesh and SKIPPED by
// `mesh-lifecycle` — meaning no per-entity `RenderMeshHandle` for the
// engine outline-occluder query to match. Procedural mesh refs go
// down the per-entity path, so the NodeMaterial swap lands cleanly.
//
// The source bomb stays auto-batched (its visual is unchanged). We do
// NOT exclude it from the pre-pass — and we don't need to: with the
// single-sphere outline, intra-mesh bleed is impossible, and the
// math still works correctly when the bomb writes its own depth into
// the prepass target:
//   • Visible bomb pixel  → prepass depth = bomb_z, outline delta=0
//                           → smoothstep 0 → invisible. Bomb shows
//                           its own colour + S270 red fuse pulse.
//   • Occluded bomb pixel → prepass depth = wall_z (bomb's instance
//                           rejected by wall's closer z), outline
//                           delta = bomb_z - wall_z > 0 → silhouette.

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
const OUTLINE_SOFT_EDGE = 0.01;
/** Procedural mesh ref — see `register-bomb-outline-builder.ts`. */
const OUTLINE_MESH_REF = "procedural:bomb-outline-sphere";

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
        // We need the source bomb's MeshRenderer presence to confirm
        // the bomb is fully spawned; we don't read its mesh ref —
        // outlines use the dedicated procedural-mesh ref.
        const _renderer = world.getComponent<MeshRendererLike>(bombId, MESH_RENDERER);
        if (_renderer === undefined) continue;
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
        world.setComponent(outlineId, MESH_RENDERER, { mesh: OUTLINE_MESH_REF });
        world.setComponent(outlineId, OUTLINE_OCCLUDER, {
          color,
          opacity: OUTLINE_OPACITY,
          softEdge: OUTLINE_SOFT_EDGE
        });
      }

      // GC orphans (source bomb removed, outline survives).
      for (const id of outlineQuery!.run()) {
        if (!id.endsWith(`.${OUTLINE_SUFFIX}`)) continue;
        const transform = world.getComponent<TransformLike>(id, TRANSFORM);
        if (transform?.parent === undefined) continue;
        if (!world.hasEntity(transform.parent)) world.removeEntity(id);
      }
    }
  };
}
