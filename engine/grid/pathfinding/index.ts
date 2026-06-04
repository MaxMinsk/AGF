// S281 AGF-ASTAR-PATHFINDING. Grid-aware A* with binary-heap open set.
//
// Public surface: `findPath(occupancy, from, to, opts?)`.
//
// Cell costs:
//   - hard block (blocksMovement + blocksBlast)  → impassable
//   - soft block (blocksMovement only)            → cost `softBlockCost` (default 3)
//   - open cell                                   → cost 1
//
// Heuristic: Manhattan distance — admissible + consistent for 4-directional grids.
// Max-iterations cap prevents runaway on pathological inputs.
//
// No Three.js / DOM / Vite imports.

import type { GridOccupancyQuery } from "../../core/systems/grid-occupancy-system";

export type PathCell = { gx: number; gz: number };

export type PathfindingOpts = {
  /** Hard cap on expanded nodes. Prevents runaway. Default 1024. */
  maxIterations?: number;
  /** Cost multiplier for cells with a soft block. Default 3. */
  softBlockCost?: number;
};

const CARDINAL: ReadonlyArray<{ dx: number; dz: number }> = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
];

function cellKey(gx: number, gz: number): string {
  return `${gx},${gz}`;
}

function manhattan(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

// ---------------------------------------------------------------------------
// Binary min-heap keyed on f = g + h.
// ---------------------------------------------------------------------------

type HeapNode = { f: number; gx: number; gz: number };

class MinHeap {
  private data: HeapNode[] = [];

  get size(): number {
    return this.data.length;
  }

  push(node: HeapNode): void {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapNode | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[p]!.f <= this.data[i]!.f) break;
      [this.data[p], this.data[i]] = [this.data[i]!, this.data[p]!];
      i = p;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    for (;;) {
      let s = i;
      const l = 2 * i + 1;
      const r = l + 1;
      if (l < n && this.data[l]!.f < this.data[s]!.f) s = l;
      if (r < n && this.data[r]!.f < this.data[s]!.f) s = r;
      if (s === i) break;
      [this.data[s], this.data[i]] = [this.data[i]!, this.data[s]!];
      i = s;
    }
  }
}

// ---------------------------------------------------------------------------
// findPath
// ---------------------------------------------------------------------------

/**
 * Find the lowest-cost path from `from` to `to` on the occupancy grid.
 *
 * Returns an array of cells from `from` to `to` (both inclusive) on success,
 * or `null` when no path exists within `maxIterations` expansions.
 *
 * Soft blocks (blocksMovement=true, blocksBlast=false) are passable at cost
 * `softBlockCost` so the planner prefers open lanes but will route through
 * mineable walls when the goal is otherwise unreachable.
 */
export function findPath(
  occupancy: GridOccupancyQuery,
  from: PathCell,
  to: PathCell,
  opts: PathfindingOpts = {}
): PathCell[] | null {
  const maxIter = opts.maxIterations ?? 1024;
  const softCost = opts.softBlockCost ?? 3;

  // Goal is a hard-blocked cell → no path.
  if (
    occupancy.blocked(to.gx, to.gz, "movement") &&
    occupancy.blocked(to.gx, to.gz, "blast")
  ) {
    return null;
  }

  if (from.gx === to.gx && from.gz === to.gz) {
    return [{ gx: from.gx, gz: from.gz }];
  }

  const openSet = new MinHeap();
  openSet.push({ f: manhattan(from.gx, from.gz, to.gx, to.gz), gx: from.gx, gz: from.gz });

  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, string | null>();

  const startKey = cellKey(from.gx, from.gz);
  gScore.set(startKey, 0);
  cameFrom.set(startKey, null);

  let iter = 0;

  while (openSet.size > 0 && iter < maxIter) {
    iter++;
    const cur = openSet.pop()!;
    const ck = cellKey(cur.gx, cur.gz);

    if (cur.gx === to.gx && cur.gz === to.gz) {
      return reconstructPath(cameFrom, ck, startKey, from);
    }

    const g = gScore.get(ck) ?? Infinity;

    for (const dir of CARDINAL) {
      const ngx = cur.gx + dir.dx;
      const ngz = cur.gz + dir.dz;

      // Hard block → skip.
      const blocksMove = occupancy.blocked(ngx, ngz, "movement");
      const blocksBlast = occupancy.blocked(ngx, ngz, "blast");
      if (blocksMove && blocksBlast) continue;

      // Soft block → higher cost; open → cost 1.
      const step = blocksMove && !blocksBlast ? softCost : 1;
      const ng = g + step;
      const nk = cellKey(ngx, ngz);

      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        cameFrom.set(nk, ck);
        openSet.push({ f: ng + manhattan(ngx, ngz, to.gx, to.gz), gx: ngx, gz: ngz });
      }
    }
  }

  return null;
}

function reconstructPath(
  cameFrom: Map<string, string | null>,
  goalKey: string,
  startKey: string,
  from: PathCell
): PathCell[] {
  const path: PathCell[] = [];
  let k: string | null = goalKey;
  while (k !== null) {
    const parts = k.split(",");
    path.unshift({ gx: Number(parts[0]), gz: Number(parts[1]) });
    k = cameFrom.get(k) ?? null;
  }
  // Ensure the from cell is the first element (key parsing is fine but let's keep it clean).
  if (path.length > 0 && (path[0]!.gx !== from.gx || path[0]!.gz !== from.gz)) {
    path[0] = { gx: from.gx, gz: from.gz };
  }
  return path;
}
