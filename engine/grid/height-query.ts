// S173 GDP-2026-05-28-010 — variable cell height (MVP).
//
// Pure helpers for reading the Heightmap singleton off the grid-config
// entity. No DOM, no Three.js, no project-specific component knowledge.
// Sample games consume these from their gameplay systems (blast walker,
// grid mover, spawn paths) to:
//
//   - look up a cell's authored height (default 0 when the heightmap is
//     missing, the cell is out-of-bounds, or the array is shorter than
//     the grid extent);
//   - decide whether two cardinal-adjacent cells are separated by a
//     cliff (any non-zero height delta in this MVP — ramps land in
//     GDP-2026-05-28-011 and will introduce a non-cliff bypass).
//
// The Heightmap component is a singleton: the engine convention is to
// place it on the same entity as the Grid singleton. Multiple Heightmap
// components in a world is undefined behaviour — `engine check` should
// flag that case the same way it flags multiple Grid components.

import type { ComponentName } from "../core/ecs/types";
import type { World } from "../core/ecs/world";

export const HEIGHTMAP: ComponentName = "Heightmap";
const GRID: ComponentName = "Grid";

export type HeightmapComponent = {
  values: ReadonlyArray<ReadonlyArray<number>>;
};

/**
 * Locate the Heightmap singleton in the world (searches for any entity
 * carrying the Heightmap component; in practice this is the grid-config
 * entity). Returns `undefined` when the world has no heightmap — callers
 * fall back to height-0 for every cell.
 */
export function findHeightmap(world: World): HeightmapComponent | undefined {
  // Prefer the grid-config entity so the lookup is O(1) when callers
  // follow the convention. Fall back to a query when the engine ever
  // adds a different host entity for the heightmap.
  const onGrid = findHeightmapNearGrid(world);
  if (onGrid !== undefined) return onGrid;
  for (const entityId of world.entityIds()) {
    if (world.hasComponent(entityId, HEIGHTMAP)) {
      return world.getComponent<HeightmapComponent>(entityId, HEIGHTMAP);
    }
  }
  return undefined;
}

function findHeightmapNearGrid(world: World): HeightmapComponent | undefined {
  for (const entityId of world.entityIds()) {
    if (!world.hasComponent(entityId, GRID)) continue;
    if (!world.hasComponent(entityId, HEIGHTMAP)) continue;
    return world.getComponent<HeightmapComponent>(entityId, HEIGHTMAP);
  }
  return undefined;
}

/**
 * Return the authored height of `(gx, gz)`. Returns 0 when:
 *   - no Heightmap singleton exists in the world;
 *   - the heightmap has no row for `gz`;
 *   - the heightmap row has no column for `gx`;
 *   - either index is negative.
 *
 * This intentionally never throws — sparse heightmaps + out-of-bounds
 * lookups are part of the contract (blast walkers, AI cones, etc. all
 * probe cells outside the arena to decide whether to stop).
 */
export function getCellHeight(world: World, gx: number, gz: number): number {
  if (gx < 0 || gz < 0) return 0;
  const heightmap = findHeightmap(world);
  if (heightmap === undefined) return 0;
  return readHeightFromValues(heightmap.values, gx, gz);
}

/**
 * True when stepping from `(fromGx, fromGz)` to `(toGx, toGz)` crosses
 * a cliff in this MVP — i.e. the two cells have different authored
 * heights. Diagonal traversals are not supported (callers only step in
 * cardinal directions on this grid); a non-cardinal pair returns
 * `false` so the helper degrades gracefully — gameplay code that does
 * diagonal movement should add its own cardinal-decomposition path.
 *
 * S179 — semantic change. Was: any non-zero height delta = cliff.
 * Now: bombers can STEP +/-1 cell height for free (climbing onto
 * adjacent stepped terrain), but a delta > 1 is a cliff. So a
 * staircase H=0 → H=1 → H=2 is fully traversable cell-by-cell,
 * while H=0 → H=2 directly is blocked. Removed the separate Ramp
 * component — the heightmap itself encodes ramps now (a row of
 * height 1 between height 0 and height 2 is the ramp).
 *
 * Cliffs are symmetric: walking up a cliff and falling down a cliff
 * both return true.
 */
export function isCliffEdge(
  world: World,
  fromGx: number,
  fromGz: number,
  toGx: number,
  toGz: number
): boolean {
  const dx = Math.abs(toGx - fromGx);
  const dz = Math.abs(toGz - fromGz);
  if (dx + dz !== 1) return false;
  const fromHeight = getCellHeight(world, fromGx, fromGz);
  const toHeight = getCellHeight(world, toGx, toGz);
  return Math.abs(fromHeight - toHeight) > 1;
}

/**
 * Passability check. As of S179, this is just `!isCliffEdge` — the
 * Ramp component path is gone; the heightmap encodes ramps via H=1
 * stepping cells. Kept as a named helper so callers stay readable.
 */
export function isPassableEdge(
  world: World,
  fromGx: number,
  fromGz: number,
  toGx: number,
  toGz: number
): boolean {
  return !isCliffEdge(world, fromGx, fromGz, toGx, toGz);
}

/**
 * Internal: read `values[gz][gx]` defensively. Exposed for tests + for
 * callers that already have the heightmap component in hand and want
 * to avoid re-walking the world.
 */
export function readHeightFromValues(
  values: ReadonlyArray<ReadonlyArray<number>>,
  gx: number,
  gz: number
): number {
  if (gx < 0 || gz < 0) return 0;
  const row = values[gz];
  if (row === undefined) return 0;
  const cell = row[gx];
  if (typeof cell !== "number" || !Number.isFinite(cell)) return 0;
  return cell;
}
