// S152 KABOOM-BOMB-BLOCK — classic-Bomberman baseline for the
// Bomb Pass power-up (GDP-2026-05-27-007).
//
// Before S152 bombs were always passable for bombers — `Bomb` entities
// had `GridOccupant.blocksMovement = false` so the engine's grid-
// movement-system never treated them as obstacles. This sprint adds
// the classic rule: a bomb that ISN'T the bomber's own is solid, and
// a bomb that IS the bomber's own becomes solid as soon as they step
// off it (no "walk back through your own bomb after step-off" — that's
// what Bomb Pass exists for).
//
// We don't change the bomb's GridOccupant (which would block everyone
// uniformly) because the rule is PER-BOMBER:
//   - bomber X's own bomb at cell C: passable while X.gridPos === C
//     (grace), then solid for X. With BomberStats.bombPass=true, the
//     post-grace block is bypassed for X (Bomb Pass override).
//   - bomber X's own bomb at cell C, with respect to bomber Y (Y ≠ X):
//     always solid.
//
// Implementation: intercept the move BEFORE grid-movement-system runs
// by clearing GridMover.queuedDirection when the would-be destination
// holds a blocking bomb. Skips bombers already mid-tween (targetGx/Gz
// is set) — their move was validated when it started.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";

const BOMB: ComponentName = "Bomb";
const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_MOVER: ComponentName = "GridMover";
const GRID_POSITION: ComponentName = "GridPosition";

type GridPos = { gx: number; gz: number };
type GridMoverComponent = {
  speed: number;
  queuedDirection?: { dx: number; dz: number };
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};
type BombComponent = { ownerId?: string };

export function createKaboomBombBlockSystem(options: {
  occupancy: GridOccupancyQuery;
  name?: string;
}): System {
  const name = options.name ?? "kaboom.bomb-block";
  const occupancy = options.occupancy;
  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      // Query bombers — anything carrying BomberStats + GridMover +
      // GridPosition. Excludes pure bomb entities; covers human +
      // bot bombers uniformly.
      bombers = world.createQuery([BOMBER_STATS, GRID_MOVER, GRID_POSITION]);
      cachedWorld = world;
    }
    for (const bomberId of bombers!.run()) {
      const mover = world.getComponent<GridMoverComponent>(bomberId, GRID_MOVER);
      if (mover?.queuedDirection === undefined) continue;
      const dx = mover.queuedDirection.dx;
      const dz = mover.queuedDirection.dz;
      if (dx === 0 && dz === 0) continue;
      // Skip in-flight tweens: grid-movement-system validated the move
      // at start, and yanking queuedDirection mid-tween won't help.
      if (mover.targetGx !== undefined || mover.targetGz !== undefined) continue;

      const pos = world.getComponent<GridPos>(bomberId, GRID_POSITION);
      if (pos === undefined) continue;
      const targetGx = pos.gx + dx;
      const targetGz = pos.gz + dz;
      // Cardinal moves only — perpendicular lane-assist is engine's job.
      const bombs = occupancy.occupants(targetGx, targetGz, "bomb");
      if (bombs.length === 0) continue;

      const stats = world.getComponent<{ bombPass?: boolean; alive?: boolean }>(bomberId, BOMBER_STATS);
      // Dead bombers don't move anyway, but leave that to grid-movement.
      if (stats?.alive === false) continue;

      let blocked = false;
      for (const bombId of bombs) {
        const bomb = world.getComponent<BombComponent>(bombId, BOMB);
        if (bomb === undefined) {
          // Unknown bomb — treat as blocking (defensive).
          blocked = true;
          break;
        }
        const isOwn = bomb.ownerId === bomberId;
        if (!isOwn) {
          // Other's bomb — always solid.
          blocked = true;
          break;
        }
        // Own bomb. Grace = bomber is still on the bomb's cell. Since
        // the move under consideration targets a NEIGHBOUR cell, the
        // bomber is BY DEFINITION not on the target's cell. The only
        // way an own-bomb-at-target shows up here is the bomber stepped
        // off and is now trying to return. No grace; needs bombPass.
        if (stats?.bombPass !== true) {
          blocked = true;
          break;
        }
      }

      if (blocked) {
        world.setComponent(bomberId, GRID_MOVER, {
          ...mover,
          queuedDirection: { dx: 0, dz: 0 }
        });
      }
    }
  };

  return { name, frameUpdate };
}
