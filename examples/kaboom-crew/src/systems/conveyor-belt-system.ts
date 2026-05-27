// S146 KABOOM-CONVEYOR-BELT — first hazard module from
// gameplay-systems.md §11.
//
// Each fixedUpdate, walks every cell carrying a ConveyorBelt
// component and:
//   - accumulates fixedDt × 1000 ms into ConveyorBelt.elapsedMs.
//   - when elapsedMs ≥ speedMs: looks up occupants of the cell via
//     GridOccupancyQuery and tries to push each one (bomber or bomb)
//     one cell along (directionDx, directionDz). Resets elapsedMs.
//   - Push succeeds when the destination is inside the arena, isn't
//     blocked by a hard wall, and (for bombs) isn't already occupied
//     by another bomb. Failures are silent — the occupant stays put
//     and the next belt tick will retry.
//
// Tie-breaks (multiple occupants on one belt cell): scan by entity id
// ascending order so behaviour is deterministic across runs.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";

const CONVEYOR_BELT: ComponentName = "ConveyorBelt";
const GRID_POSITION: ComponentName = "GridPosition";
const TRANSFORM: ComponentName = "Transform";
const BOMB: ComponentName = "Bomb";
const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_MOVER: ComponentName = "GridMover";

const DEFAULT_SPEED_MS = 400;

type ConveyorBeltComponent = {
  directionDx: number;
  directionDz: number;
  speedMs?: number;
  elapsedMs?: number;
};

type GridPos = { gx: number; gz: number };
type TransformComponent = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
};
type GridMoverComponent = {
  speed: number;
  queuedDirection?: { dx: number; dz: number };
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};

export function createKaboomConveyorBeltSystem(options: {
  occupancy: GridOccupancyQuery;
  name?: string;
}): System {
  const name = options.name ?? "kaboom.conveyor-belt";
  const occupancy = options.occupancy;
  let cachedWorld: World | undefined;
  let belts: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      belts = world.createQuery([CONVEYOR_BELT, GRID_POSITION]);
      cachedWorld = world;
    }
    const dtMs = Math.max(0, context.time.fixedDt) * 1000;
    if (dtMs <= 0) return;

    // Sort belt cells by entity id so tie-breaks at intersections are
    // deterministic. Belt count is small (tens at most) so the sort is
    // negligible.
    const beltIds = [...belts!.run()].sort();
    for (const beltId of beltIds) {
      const belt = world.getComponent<ConveyorBeltComponent>(beltId, CONVEYOR_BELT);
      const pos = world.getComponent<GridPos>(beltId, GRID_POSITION);
      if (belt === undefined || pos === undefined) continue;
      const speedMs = Math.max(100, belt.speedMs ?? DEFAULT_SPEED_MS);
      const dx = belt.directionDx;
      const dz = belt.directionDz;
      if (dx === 0 && dz === 0) continue;
      const elapsed = (belt.elapsedMs ?? 0) + dtMs;
      if (elapsed < speedMs) {
        world.setComponent(beltId, CONVEYOR_BELT, { ...belt, elapsedMs: elapsed });
        continue;
      }
      // Push all eligible occupants once; we don't iterate multiple
      // pushes per fixedUpdate even if elapsed >> speedMs (a long
      // pause shouldn't catapult occupants several cells in one tick).
      pushOccupants(world, occupancy, pos.gx, pos.gz, dx, dz);
      world.setComponent(beltId, CONVEYOR_BELT, {
        ...belt,
        elapsedMs: Math.max(0, elapsed - speedMs)
      });
    }
  };

  return { name, fixedUpdate };
}

function pushOccupants(
  world: World,
  occupancy: GridOccupancyQuery,
  gx: number,
  gz: number,
  dx: number,
  dz: number
): void {
  const destGx = gx + dx;
  const destGz = gz + dz;
  // Hard wall in the destination cell blocks every push (bomber + bomb).
  if (occupancy.blocked(destGx, destGz, "blast")) return;
  const candidates = [...occupancy.occupants(gx, gz)].sort();
  for (const id of candidates) {
    if (world.hasComponent(id, BOMBER_STATS)) {
      pushBomber(world, id, destGx, destGz);
    } else if (world.hasComponent(id, BOMB)) {
      pushBomb(world, occupancy, id, destGx, destGz);
    }
  }
}

function pushBomber(
  world: World,
  bomberId: EntityId,
  destGx: number,
  destGz: number
): void {
  const stats = world.getComponent<{ alive?: boolean }>(bomberId, BOMBER_STATS);
  if (stats?.alive === false) return;
  // Snap GridPosition + Transform to the new cell. Same pattern as
  // bomb-kick: the next grid-movement tick interpolates from here.
  world.setComponent(bomberId, GRID_POSITION, { gx: destGx, gz: destGz });
  const transform = world.getComponent<TransformComponent>(bomberId, TRANSFORM);
  if (transform !== undefined) {
    world.setComponent(bomberId, TRANSFORM, {
      ...transform,
      position: [destGx, transform.position?.[1] ?? 0.4, destGz]
    });
  }
  // Reset queuedDirection so the grid-mover doesn't immediately fight
  // the push by sliding the bomber back where it came from.
  const mover = world.getComponent<GridMoverComponent>(bomberId, GRID_MOVER);
  if (mover !== undefined && mover.queuedDirection !== undefined) {
    world.setComponent(bomberId, GRID_MOVER, {
      ...mover,
      queuedDirection: { dx: 0, dz: 0 },
      currentLerp: 0
    });
  }
}

function pushBomb(
  world: World,
  occupancy: GridOccupancyQuery,
  bombId: EntityId,
  destGx: number,
  destGz: number
): void {
  // Bomb can't share its destination with another bomb.
  for (const id of occupancy.occupants(destGx, destGz, "bomb")) {
    void id;
    return;
  }
  world.setComponent(bombId, GRID_POSITION, { gx: destGx, gz: destGz });
  const transform = world.getComponent<TransformComponent>(bombId, TRANSFORM);
  if (transform !== undefined) {
    world.setComponent(bombId, TRANSFORM, {
      ...transform,
      position: [destGx, transform.position?.[1] ?? 0.35, destGz]
    });
  }
}
