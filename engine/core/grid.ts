// S81 KABOOM-GRID-POSITION. Pure helpers for converting between
// world-space and grid-cell coordinates. Engine consumers (and project
// gameplay code) import these directly; no class wrapper, no DOM
// touchpoint, no Three.js types — fits cleanly under `engine/core/`
// and is therefore safe to use from system code, project scripts and
// unit tests alike.

export type GridConfig = {
  cellSize: number;
  sizeX: number;
  sizeZ: number;
  originX?: number;
  originZ?: number;
};

export type GridCell = {
  gx: number;
  gz: number;
};

/**
 * World position → integer cell coordinates. `originX/originZ` give the
 * world position of cell (0, 0)'s centre; `cellSize` the world-space
 * side length. Out-of-bounds inputs round into bounds — callers that
 * need a "in-bounds?" check should test against `sizeX/sizeZ` AFTER
 * this call.
 */
export function worldToGrid(grid: GridConfig, worldX: number, worldZ: number): GridCell {
  const originX = grid.originX ?? 0;
  const originZ = grid.originZ ?? 0;
  // `+ 0.5` so a position exactly on a cell centre rounds back to that
  // cell without floating-point bias.
  return {
    gx: Math.floor((worldX - originX) / grid.cellSize + 0.5),
    gz: Math.floor((worldZ - originZ) / grid.cellSize + 0.5)
  };
}

/**
 * Cell coordinates → world position of the cell's centre. Returns a
 * fresh 3-tuple so callers can drop it straight into Transform.position.
 * Y is left at 0 — projects pick the vertical placement themselves
 * (most Kaboom Crew entities sit at y = 0.5, half the cube height).
 */
export function gridToWorld(grid: GridConfig, gx: number, gz: number): [number, number, number] {
  const originX = grid.originX ?? 0;
  const originZ = grid.originZ ?? 0;
  return [originX + gx * grid.cellSize, 0, originZ + gz * grid.cellSize];
}

/** True when `(gx, gz)` lies inside the declared grid extents. */
export function isInBounds(grid: GridConfig, gx: number, gz: number): boolean {
  return gx >= 0 && gz >= 0 && gx < grid.sizeX && gz < grid.sizeZ;
}

/** Stable key for use in Map/Set indexes (e.g. GridOccupancySystem). */
export function cellKey(gx: number, gz: number): string {
  return `${gx}|${gz}`;
}

/** Inverse of cellKey — used by occupancy iterators that store keys. */
export function parseCellKey(key: string): GridCell {
  const idx = key.indexOf("|");
  if (idx < 0) throw new Error(`[agf:grid] cellKey "${key}" missing separator.`);
  return { gx: Number(key.slice(0, idx)), gz: Number(key.slice(idx + 1)) };
}
