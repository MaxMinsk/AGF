// S100 KABOOM-KICK-POWER-UP.
//
// When a bomber holds the kick power-up (BomberStats.canKick = true)
// and walks INTO a cell occupied by one of their own bombs, the bomb
// slides one cell forward in the same direction. If the cell beyond
// the bomb is blocked (hard wall, another bomb, etc.) the kick fails
// silently and the bomber walks through as today.
//
// Runs in fixedUpdate AFTER player-input-system (so queuedDirection
// is populated) and BEFORE grid-movement-system commits the step.
// Lookup is by-direction: for each kicker, compute the cell ahead
// of their CURRENT cell + check whether THIS bomber owns a bomb
// there. The bomber's queued direction is preserved — they continue
// walking; the bomb is just out of the way one cell sooner.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";

const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_POSITION: ComponentName = "GridPosition";
const GRID_MOVER: ComponentName = "GridMover";
const PLAYER_CONTROLLED: ComponentName = "PlayerControlled";
const BOMB: ComponentName = "Bomb";
const TRANSFORM: ComponentName = "Transform";

type BomberStats = { canKick?: boolean; alive?: boolean };
type GridPos = { gx: number; gz: number };
type GridMover = {
  speed: number;
  queuedDirection?: { dx: number; dz: number };
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};
type Bomb = { ownerId?: EntityId };
type Transform = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
};

export type KaboomBombKickSystemOptions = {
  name?: string;
  occupancy: GridOccupancyQuery;
};

export function createKaboomBombKickSystem(options: KaboomBombKickSystemOptions): System {
  const name = options.name ?? "kaboom.bomb-kick";
  const occupancy = options.occupancy;

  let cachedWorld: World | undefined;
  let kickers: QueryHandle | undefined;

  const fixedUpdate = (ctx: SystemContext): void => {
    const world = ctx.world;
    if (world !== cachedWorld) {
      kickers = world.createQuery([PLAYER_CONTROLLED, BOMBER_STATS, GRID_POSITION, GRID_MOVER]);
      cachedWorld = world;
    }
    for (const bomberId of kickers!.run()) {
      const stats = world.getComponent<BomberStats>(bomberId, BOMBER_STATS);
      if (stats?.canKick !== true || stats.alive === false) continue;
      const mover = world.getComponent<GridMover>(bomberId, GRID_MOVER);
      if (mover === undefined) continue;
      const dir = mover.queuedDirection;
      if (dir === undefined || (dir.dx === 0 && dir.dz === 0)) continue;
      // Only kick when the bomber is idle on a cell — mid-lerp kicks
      // would mean the bomber is already mid-transition and would
      // double-process.
      if ((mover.currentLerp ?? 0) > 0) continue;
      const pos = world.getComponent<GridPos>(bomberId, GRID_POSITION);
      if (pos === undefined) continue;
      const aheadGx = pos.gx + dir.dx;
      const aheadGz = pos.gz + dir.dz;
      // Find a bomb owned by this bomber at the cell ahead.
      let ownedBombId: EntityId | undefined;
      for (const id of occupancy.occupants(aheadGx, aheadGz, "bomb")) {
        const bomb = world.getComponent<Bomb>(id, BOMB);
        if (bomb?.ownerId === bomberId) {
          ownedBombId = id;
          break;
        }
      }
      if (ownedBombId === undefined) continue;
      // Beyond cell — must be free for movement AND free of bombs.
      const beyondGx = aheadGx + dir.dx;
      const beyondGz = aheadGz + dir.dz;
      if (occupancy.blocked(beyondGx, beyondGz, "movement")) continue;
      // No other bomb at the beyond cell (would otherwise stack).
      let beyondHasBomb = false;
      for (const id of occupancy.occupants(beyondGx, beyondGz, "bomb")) {
        if (id !== ownedBombId) {
          beyondHasBomb = true;
          break;
        }
      }
      if (beyondHasBomb) continue;
      // Slide the bomb. GridPosition + Transform.position both update
      // so the renderer + occupancy index pick up the move.
      world.setComponent(ownedBombId, GRID_POSITION, { gx: beyondGx, gz: beyondGz });
      const transform = world.getComponent<Transform>(ownedBombId, TRANSFORM);
      if (transform !== undefined) {
        const y = transform.position?.[1] ?? 0.35;
        world.setComponent(ownedBombId, TRANSFORM, {
          ...transform,
          position: [beyondGx, y, beyondGz]
        });
      }
    }
  };

  return { name, fixedUpdate };
}
