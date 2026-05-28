// S174 GDP-2026-05-28-011 — Ramps (MVP).
//
// Pure helpers for reading per-cell Ramp components from the world.
// Ramps bridge two cardinal-adjacent cells whose heights differ by 1
// (v1 supports delta=1 only). The Ramp component lives on the lower
// cell — its `direction` points from the ramp cell toward the higher
// cell (the "to" cell). The pair `(rampCell, toCell)` is the only
// edge a ramp suppresses; other neighbours of the ramp cell still
// respect normal cliff rules.
//
// No DOM, no Three.js, no project-specific imports. Sample games
// consume these from their gameplay systems (blast walker, grid mover,
// height-aware Y placement) to:
//
//   - look up the Ramp data at a specific cell (O(n) scan across
//     entities carrying both GridPosition + Ramp — n ≪ 100 in
//     practice since arenas ship a handful of ramps);
//   - decide whether a cardinal step between two cells crosses a ramp
//     (suppresses cliff edges that would otherwise block movement /
//     blast).
//
// The lookup is intentionally a linear scan rather than a cached
// index. Ramps are arena fixtures — they don't move, but they're
// also rare enough (~5-10 per scene) that an index isn't worth the
// invalidation overhead. If profiling shows otherwise, swap the
// scan for a `Map<cellKey, RampComponent>` keyed off
// (gx * sizeZ + gz).

import type { ComponentName } from "../core/ecs/types";
import type { World } from "../core/ecs/world";

export const RAMP: ComponentName = "Ramp";
const GRID_POSITION: ComponentName = "GridPosition";

export type RampDirection = "N" | "E" | "S" | "W";

export type RampComponent = {
  fromHeight: number;
  toHeight: number;
  direction: RampDirection;
};

type GridPositionLike = { gx: number; gz: number };

/**
 * Return the unit vector pointing FROM the ramp cell TOWARD the to-cell.
 * Z+ is south, Z- is north — matches the rest of the engine grid
 * convention (see `gridToWorld` + the cardinal `DIRECTIONS` arrays in
 * the gameplay systems).
 */
export function rampDirectionDelta(direction: RampDirection): { dx: number; dz: number } {
  switch (direction) {
    case "N":
      return { dx: 0, dz: -1 };
    case "E":
      return { dx: 1, dz: 0 };
    case "S":
      return { dx: 0, dz: 1 };
    case "W":
      return { dx: -1, dz: 0 };
  }
}

/**
 * Look up the Ramp data at cell `(gx, gz)`. Returns `undefined` when
 * no entity sits on that cell with a Ramp component. O(n) over all
 * entities — see file header for why.
 */
export function getRampAt(world: World, gx: number, gz: number): RampComponent | undefined {
  for (const entityId of world.entityIds()) {
    if (!world.hasComponent(entityId, RAMP)) continue;
    if (!world.hasComponent(entityId, GRID_POSITION)) continue;
    const pos = world.getComponent<GridPositionLike>(entityId, GRID_POSITION);
    if (pos === undefined) continue;
    if (pos.gx !== gx || pos.gz !== gz) continue;
    const ramp = world.getComponent<RampComponent>(entityId, RAMP);
    if (ramp === undefined) continue;
    return ramp;
  }
  return undefined;
}

/**
 * True when stepping from `(fromGx, fromGz)` to `(toGx, toGz)` is
 * carried by a ramp — i.e. either:
 *   - the FROM cell carries a Ramp whose `direction` points at the TO
 *     cell (climbing the ramp), OR
 *   - the TO cell carries a Ramp whose `direction` points BACK at the
 *     FROM cell (descending the ramp).
 *
 * Non-cardinal pairs (diagonal, distance > 1, same cell) always return
 * false — same degrade-gracefully contract as `isCliffEdge`.
 *
 * This function defines "ramp-suppressed cliff edges" — gameplay code
 * combines it with `isCliffEdge` via `isPassableEdge` (below) so a
 * ramp clears the height delta between its two endpoints. Other
 * neighbours of either cell still get cliff-blocked because their
 * pair is NOT the ramp's endpoint pair.
 */
export function isRampEdge(
  world: World,
  fromGx: number,
  fromGz: number,
  toGx: number,
  toGz: number
): boolean {
  const dx = toGx - fromGx;
  const dz = toGz - fromGz;
  if (Math.abs(dx) + Math.abs(dz) !== 1) return false;

  // Climbing: ramp at the FROM cell points TOWARD the TO cell.
  const fromRamp = getRampAt(world, fromGx, fromGz);
  if (fromRamp !== undefined) {
    const delta = rampDirectionDelta(fromRamp.direction);
    if (delta.dx === dx && delta.dz === dz) return true;
  }

  // Descending: ramp at the TO cell points BACK at the FROM cell.
  // i.e. the ramp's direction equals (-dx, -dz) so going (dx, dz) is
  // the reverse of the climb.
  const toRamp = getRampAt(world, toGx, toGz);
  if (toRamp !== undefined) {
    const delta = rampDirectionDelta(toRamp.direction);
    if (delta.dx === -dx && delta.dz === -dz) return true;
  }

  return false;
}

/**
 * Return the Y a bomber should "stand on" when occupying `(gx, gz)`:
 *   - a flat cell → its authored height;
 *   - a ramp cell → the midpoint between fromHeight and toHeight, so
 *     the bomber visually sits on the slope.
 *
 * Takes the flat-cell height as a parameter to keep this function pure
 * and avoid the height-query import cycle. Callers pass
 * `getCellHeight(world, gx, gz)`.
 */
export function rampStandOnHeight(
  world: World,
  gx: number,
  gz: number,
  baseCellHeight: number
): number {
  const ramp = getRampAt(world, gx, gz);
  if (ramp === undefined) return baseCellHeight;
  return (ramp.fromHeight + ramp.toHeight) / 2;
}
