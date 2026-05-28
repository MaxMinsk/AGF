// S178 KABOOM-BOMBER-HEIGHT-LIFT — keep bomber/bomb/pickup Y in sync
// with the cell they're standing on. S173 lifted entities at SPAWN
// time via applyHeightmapCommands, but the engine grid-movement-system
// only tweens X/Z during cell-tween — it never writes Y. The result:
// a bomber walking off a plateau onto a flat cell kept the plateau's
// Y; a bomber walking up a ramp pair stayed at the first ramp's Y and
// clipped through the second ramp's mesh (user feedback
// 2026-05-28: "я хожу по 1 под тайлами которые на 2").
//
// This system runs each fixedUpdate. For every entity with a
// GridPosition + Transform that's NOT parented to another root, it
// resolves the cell's "stand-on" height (heightmap value for regular
// cells, midpoint for ramp cells matching the cell), writes
// Transform.position.y = authoredBaseY + standOnHeight.
//
// "authoredBaseY" is captured the first time the system sees the
// entity — it's whatever the spawn pipeline left Y at on the flat
// arena. Stored in a per-entity map so re-reading current Y
// (post-lift) doesn't compound.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { getCellHeight } from "../../../../engine/grid/height-query";

const TRANSFORM: ComponentName = "Transform";
const GRID_POSITION: ComponentName = "GridPosition";
const BOMBER_STATS: ComponentName = "BomberStats";
const BOMB: ComponentName = "Bomb";
const PICKUP: ComponentName = "Pickup";

type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};

type GridPos = { gx?: number; gz?: number };

export function createKaboomBomberHeightLiftSystem(): System {
  const name = "kaboom.bomber-height-lift";
  // Authored Y per entity — captured on first sight, used as the base
  // we lift FROM. Stays in sync across rounds because scene-load wipes
  // entities and the map gets cleared via cachedWorld swap.
  const authoredBaseY = new Map<EntityId, number>();
  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;
  let bombs: QueryHandle | undefined;
  let pickups: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS, GRID_POSITION, TRANSFORM]);
      bombs = world.createQuery([BOMB, GRID_POSITION, TRANSFORM]);
      pickups = world.createQuery([PICKUP, GRID_POSITION, TRANSFORM]);
      cachedWorld = world;
      authoredBaseY.clear();
    }

    const liftOne = (entityId: EntityId): void => {
      const transform = world.getComponent<TransformLike>(entityId, TRANSFORM);
      if (transform === undefined || transform.position === undefined) return;
      if (typeof transform.parent === "string" && transform.parent.length > 0) return;
      const pos = world.getComponent<GridPos>(entityId, GRID_POSITION);
      if (pos?.gx === undefined || pos?.gz === undefined) return;
      const standOn = standOnHeightAt(world, pos.gx, pos.gz);
      // Bombers have a BenchAnimationState driver that overwrites
      // Transform.position.y each fixedUpdate (idle bob + walk root
      // bob). Writing Transform directly would last one tick before
      // the animator clobbers it. Stamp HeightLift{offsetY} — the
      // bench-animation system adds it to its captured base.y so the
      // bob still oscillates around the elevated pose.
      const existing = world.getComponent<{ offsetY?: number }>(entityId, "HeightLift");
      if (existing?.offsetY !== standOn) {
        world.setComponent(entityId, "HeightLift", { offsetY: standOn });
      }
      // For entities without an animation driver (bombs, pickups),
      // also write Transform.position.y directly. The HeightLift
      // stamp above is harmless on them.
      if (world.hasComponent(entityId, "BenchAnimationState")) return;
      let base = authoredBaseY.get(entityId);
      if (base === undefined) {
        const currentY = transform.position[1] ?? 0;
        base = currentY - standOn;
        authoredBaseY.set(entityId, base);
      }
      const targetY = base + standOn;
      const [tx, ty, tz] = transform.position;
      if (Math.abs((ty ?? 0) - targetY) < 1e-4) return;
      world.setComponent(entityId, TRANSFORM, {
        ...transform,
        position: [tx, targetY, tz] as [number, number, number]
      });
    };

    for (const id of bombers!.run()) liftOne(id);
    for (const id of bombs!.run()) liftOne(id);
    for (const id of pickups!.run()) liftOne(id);

    // GC: drop entries for entities that no longer exist.
    for (const id of [...authoredBaseY.keys()]) {
      if (!world.hasEntity(id)) authoredBaseY.delete(id);
    }
  };

  return { name, fixedUpdate };
}

/** Pure helper — resolve the cell's "stand-on" Y. S179: heightmap-only
 *  (the Ramp component is gone; stepped terrain encodes ramps via H=1
 *  cells the bomber can traverse for free). */
function standOnHeightAt(world: World, gx: number, gz: number): number {
  return getCellHeight(world, gx, gz);
}
