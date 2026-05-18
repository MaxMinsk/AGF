// S81 KABOOM-GRID-MOVER. Smoothly tweens GridMover entities between
// cells:
//
//   - reads `GridMover { speed, queuedDirection, currentLerp,
//     targetGx?, targetGz? }`
//   - reads `GridPosition { gx, gz }`
//   - writes `Transform.position` (world-space tween)
//   - on completion: writes `GridPosition = target`, resets currentLerp,
//     pulls the next queuedDirection
//
// Blocked destinations: the system consults a `GridOccupancySystem`
// handle (passed at construction so we avoid a circular system import)
// and applies a lane-assist fallback: if the queued cardinal is
// blocked, the perpendicular cardinals are tried in order. This is the
// usual arcade ergonomics — players holding "right" against a wall
// naturally slip up or down past a corner without re-pressing.
//
// Grid config: the system reads the singleton `Grid` component from
// the active world each frame; if absent, the system silently no-ops
// (project boot is still in progress).

import type { ComponentName, EntityId } from "../ecs/types";
import type { QueryHandle, World } from "../ecs/world";
import { gridToWorld, isInBounds, type GridConfig } from "../grid";
import type { System, SystemContext } from "./types";
import type { GridOccupancyQuery } from "./grid-occupancy-system";

export const GRID_MOVER: ComponentName = "GridMover";
export const GRID_POSITION: ComponentName = "GridPosition";
export const GRID: ComponentName = "Grid";
export const TRANSFORM: ComponentName = "Transform";

type Direction = { dx: number; dz: number };
type GridMoverComponent = {
  speed: number;
  queuedDirection?: Direction;
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};
type GridPositionComponent = { gx: number; gz: number };
type TransformComponent = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
};

export type GridMovementSystemOptions = {
  /** GridOccupancySystem handle used for the blocked-cell check + lane-assist. */
  occupancy: GridOccupancyQuery;
  name?: string;
};

export function createGridMovementSystem(options: GridMovementSystemOptions): System {
  const occupancy = options.occupancy;
  const name = options.name ?? "core.grid-movement";

  let cachedWorld: World | undefined;
  let movers: QueryHandle | undefined;
  let grids: QueryHandle | undefined;

  function readGridConfig(world: World): GridConfig | undefined {
    if (grids === undefined) grids = world.createQuery([GRID]);
    const candidates = grids.run();
    if (candidates.length === 0) return undefined;
    return world.getComponent<GridConfig>(candidates[0]!, GRID);
  }

  function perpendicular(d: Direction): ReadonlyArray<Direction> {
    if (d.dx !== 0 && d.dz === 0) return [{ dx: 0, dz: 1 }, { dx: 0, dz: -1 }];
    if (d.dz !== 0 && d.dx === 0) return [{ dx: 1, dz: 0 }, { dx: -1, dz: 0 }];
    // Diagonals + zero are not lane-assisted.
    return [];
  }

  function isPassable(
    grid: GridConfig,
    gx: number,
    gz: number
  ): boolean {
    if (!isInBounds(grid, gx, gz)) return false;
    return !occupancy.blocked(gx, gz, "movement");
  }

  function startMotion(
    grid: GridConfig,
    world: World,
    entityId: EntityId,
    mover: GridMoverComponent,
    pos: GridPositionComponent
  ): { gx: number; gz: number } | undefined {
    const direction = mover.queuedDirection;
    if (direction === undefined || (direction.dx === 0 && direction.dz === 0)) return undefined;
    const candidates: Direction[] = [direction, ...perpendicular(direction)];
    for (const d of candidates) {
      const targetGx = pos.gx + d.dx;
      const targetGz = pos.gz + d.dz;
      if (isPassable(grid, targetGx, targetGz)) {
        return { gx: targetGx, gz: targetGz };
      }
    }
    return undefined;
  }

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      movers = world.createQuery([GRID_MOVER, GRID_POSITION, TRANSFORM]);
      grids = world.createQuery([GRID]);
      cachedWorld = world;
    }
    const grid = readGridConfig(world);
    if (grid === undefined) return;
    const dt = Math.max(0, context.time.dt);

    for (const entityId of movers!.run()) {
      const mover = world.getComponent<GridMoverComponent>(entityId, GRID_MOVER);
      const pos = world.getComponent<GridPositionComponent>(entityId, GRID_POSITION);
      if (mover === undefined || pos === undefined) continue;

      // Already in motion?
      let target: { gx: number; gz: number } | undefined;
      if (typeof mover.targetGx === "number" && typeof mover.targetGz === "number") {
        target = { gx: mover.targetGx, gz: mover.targetGz };
      }
      if (target === undefined) {
        target = startMotion(grid, world, entityId, mover, pos);
        if (target === undefined) {
          // Stationary — keep Transform aligned with the current cell.
          const [wx, , wz] = gridToWorld(grid, pos.gx, pos.gz);
          const transform = world.getComponent<TransformComponent>(entityId, TRANSFORM) ?? {};
          world.setComponent(entityId, TRANSFORM, {
            ...transform,
            position: [wx, transform.position?.[1] ?? 0, wz]
          });
          if (mover.currentLerp !== 0) {
            world.setComponent(entityId, GRID_MOVER, { ...mover, currentLerp: 0, targetGx: undefined, targetGz: undefined });
          }
          continue;
        }
      }

      // Advance lerp.
      const lerpStep = dt * mover.speed; // cells per second × dt = fraction of a cell
      const nextLerp = (mover.currentLerp ?? 0) + lerpStep;
      if (nextLerp >= 1) {
        // Cell boundary: snap GridPosition to the target. Carry the
        // overshoot (nextLerp - 1) into a new tween if the next move
        // is still queued + passable — that prevents a one-frame
        // micro-stutter where the entity stops on the cell boundary
        // before the next direction is picked up. The carried lerp
        // value lives entirely inside this same fixed step, so the
        // pose written below already reflects the head start.
        const overshoot = Math.min(nextLerp - 1, 0.999);
        const carriedPos: GridPositionComponent = { gx: target.gx, gz: target.gz };
        world.setComponent(entityId, GRID_POSITION, carriedPos);

        // Probe for a next tween from the new cell.
        const nextTarget = startMotion(grid, world, entityId, mover, carriedPos);
        const transform = world.getComponent<TransformComponent>(entityId, TRANSFORM) ?? {};
        const y = transform.position?.[1] ?? 0;
        if (nextTarget !== undefined) {
          const [sx, , sz] = gridToWorld(grid, carriedPos.gx, carriedPos.gz);
          const [tx, , tz] = gridToWorld(grid, nextTarget.gx, nextTarget.gz);
          world.setComponent(entityId, TRANSFORM, {
            ...transform,
            position: [sx + (tx - sx) * overshoot, y, sz + (tz - sz) * overshoot]
          });
          world.setComponent(entityId, GRID_MOVER, {
            ...mover,
            currentLerp: overshoot,
            targetGx: nextTarget.gx,
            targetGz: nextTarget.gz
          });
        } else {
          // No next move — settle on the cell. This is the existing
          // "stationary" path: align Transform to the cell centre and
          // clear targetGx/targetGz.
          const [tx, , tz] = gridToWorld(grid, target.gx, target.gz);
          world.setComponent(entityId, TRANSFORM, { ...transform, position: [tx, y, tz] });
          world.setComponent(entityId, GRID_MOVER, {
            ...mover,
            currentLerp: 0,
            targetGx: undefined,
            targetGz: undefined
          });
        }
        continue;
      }

      // Mid-tween: blend Transform.position between start and target.
      const [sx, , sz] = gridToWorld(grid, pos.gx, pos.gz);
      const [tx, , tz] = gridToWorld(grid, target.gx, target.gz);
      const transform = world.getComponent<TransformComponent>(entityId, TRANSFORM) ?? {};
      const y = transform.position?.[1] ?? 0;
      world.setComponent(entityId, TRANSFORM, {
        ...transform,
        position: [sx + (tx - sx) * nextLerp, y, sz + (tz - sz) * nextLerp]
      });
      world.setComponent(entityId, GRID_MOVER, {
        ...mover,
        currentLerp: nextLerp,
        targetGx: target.gx,
        targetGz: target.gz
      });
    }
  };

  return { name, frameUpdate };
}
