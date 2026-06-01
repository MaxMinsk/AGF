// S213 KABOOM-SCORCH-V2 (GDP-2026-05-30-004 Approach 2).
//
// Per-blast-cell soot mark. Each cell that a blast visits gets a
// thin dark box entity at the cell's top face that lingers for ~3 s
// then collapses to zero via the engine Tween system. Owning its
// own entity (instead of projecting a DecalGeometry onto the floor
// mesh like the reverted S207 attempt) keeps the mark independent
// of Wang autotile re-resolves and soft-block destruction — neither
// touches the ScorchTile, so the mark stays visible across all
// downstream cell-mesh churn.
//
// Visual model — scale-shrink, not opacity fade:
//   - spawn at scale [0.85, 0.012, 0.85] (thin dark slab the size
//     of ~85 % of a cell, just above the floor).
//   - dark warm tone #1a0a05 (soot, not paint).
//   - engine Tween drives scale → [0, 0.012, 0] over the full
//     lifetime; the X/Z components vanish first, giving a visible
//     "pinches in from the edges" fade readable from any camera
//     angle.
//   - no opacity / transparent / depthWrite tricks — opacity-based
//     fade hit a hard wall during S207 V1..V4 (engine bug we just
//     fixed in three-render-adapter.ts), so V2 deliberately uses
//     geometry-only fade.
//
// Stacking: multiple blasts on the same cell spawn independent
// ScorchTile entities. They overlap visibly + each fades on its own
// timeline.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { getCellHeight } from "../../../../engine/grid/height-query";

const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const TWEENS: ComponentName = "Tweens";
const SCORCH_TILE: ComponentName = "ScorchTile";

/** Total lifetime in milliseconds before the entity is despawned. */
export const SCORCH_LIFETIME_MS_DEFAULT = 3000;
/** Half-cell XZ scale on spawn. 0.85 leaves a small margin from
 *  cell edges so adjacent cells' scorches don't merge into a hard
 *  rectangle on the floor — they read as separate marks first,
 *  then the gap closes as the chain ages. */
const SCORCH_BASE_XZ_SCALE = 0.85;
/** Thin Y so the slab reads as a flat mark, not a hovering brick. */
const SCORCH_BASE_Y_SCALE = 0.012;
/** Slight float above the floor face to avoid Z-fighting with the
 *  cell top + the BlastTile that spawns at the same cell. */
const SCORCH_Y_OFFSET = 0.014;
/** Dark warm soot. Picked so the mark reads on every theme floor
 *  palette without a per-theme override. */
const SCORCH_HEX_DEFAULT = "#1a0a05";

let counter = 0;

/** Spawn a scorch decal entity at (gx, gz). Called by
 *  blast-propagation-system at each visited cell. */
export function spawnScorchTile(
  world: World,
  gx: number,
  gz: number,
  lifetimeMs: number = SCORCH_LIFETIME_MS_DEFAULT,
  hex: string = SCORCH_HEX_DEFAULT
): EntityId {
  counter += 1;
  const id: EntityId = `kaboom.scorch.${counter}.${gx}.${gz}`;
  world.addEntity(id);
  const cellH = getCellHeight(world, gx, gz);
  world.setComponent(id, TRANSFORM, {
    position: [gx, cellH + SCORCH_Y_OFFSET, gz],
    rotation: [0, 0, 0],
    scale: [SCORCH_BASE_XZ_SCALE, SCORCH_BASE_Y_SCALE, SCORCH_BASE_XZ_SCALE]
  });
  world.setComponent(id, MESH_RENDERER, { mesh: "box", color: hex });
  world.setComponent(id, SCORCH_TILE, { elapsedMs: 0, lifetimeMs });
  // Engine Tween drives the X+Z scale to zero across the full
  // lifetime; easeInQuad keeps the slab readable for most of its
  // life and shrinks faster near the end. Y stays constant so the
  // slab doesn't flatten weirdly.
  world.setComponent(id, TWEENS, [
    {
      component: TRANSFORM,
      property: "scale",
      from: [SCORCH_BASE_XZ_SCALE, SCORCH_BASE_Y_SCALE, SCORCH_BASE_XZ_SCALE],
      to: [0, SCORCH_BASE_Y_SCALE, 0],
      duration: lifetimeMs / 1000,
      ease: "easeInQuad"
    }
  ]);
  return id;
}

type ScorchTileComponent = { elapsedMs?: number; lifetimeMs?: number };

/** Lifetime system — ticks elapsedMs per fixedUpdate and removes
 *  the entity once it crosses lifetimeMs. The visible shrink is
 *  driven by the engine Tween system on Transform.scale; this
 *  system owns only the GC pass. */
export function createKaboomScorchTileLifetimeSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "kaboom.scorch-tile-lifetime";
  let cachedWorld: World | undefined;
  let scorches: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      scorches = world.createQuery([SCORCH_TILE]);
      cachedWorld = world;
    }
    const dtMs = Math.max(0, context.time.fixedDt) * 1000;
    const toRemove: EntityId[] = [];
    for (const id of scorches!.run()) {
      const sc = world.getComponent<ScorchTileComponent>(id, SCORCH_TILE);
      if (sc === undefined) continue;
      const lifetime = sc.lifetimeMs ?? SCORCH_LIFETIME_MS_DEFAULT;
      const elapsed = (sc.elapsedMs ?? 0) + dtMs;
      if (elapsed >= lifetime) {
        toRemove.push(id);
        continue;
      }
      world.setComponent(id, SCORCH_TILE, { ...sc, elapsedMs: elapsed });
    }
    for (const id of toRemove) world.removeEntity(id);
  };

  return { name, fixedUpdate };
}
