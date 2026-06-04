// S281 — A* pathfinding engine module unit tests.

import { describe, expect, it } from "vitest";

import { findPath } from "../../engine/grid/pathfinding/index";
import type { GridOccupancyQuery } from "../../engine/core/systems/grid-occupancy-system";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock GridOccupancyQuery from a string grid where:
 *   '#' = hard block (blocksMovement + blocksBlast)
 *   'S' = soft block (blocksMovement only)
 *   '.' = open
 *
 * Grid rows map to gz (row 0 = gz 0 at top), columns to gx.
 */
function makeOccupancy(rows: string[]): GridOccupancyQuery {
  const hard = new Set<string>();
  const soft = new Set<string>();
  const maxGz = rows.length - 1;
  const maxGx = Math.max(...rows.map(r => r.length - 1));
  for (let gz = 0; gz < rows.length; gz++) {
    const row = rows[gz]!;
    for (let gx = 0; gx < row.length; gx++) {
      const ch = row[gx];
      if (ch === "#") hard.add(`${gx},${gz}`);
      else if (ch === "S") soft.add(`${gx},${gz}`);
    }
  }
  function outOfBounds(gx: number, gz: number): boolean {
    return gx < 0 || gz < 0 || gx > maxGx || gz > maxGz;
  }
  return {
    occupants(gx, gz, layer?) {
      void layer;
      if (outOfBounds(gx, gz)) return [];
      const k = `${gx},${gz}`;
      if (hard.has(k) || soft.has(k)) return [k as unknown as string];
      return [];
    },
    blocked(gx, gz, predicate?) {
      // Treat out-of-bounds as hard block.
      if (outOfBounds(gx, gz)) return true;
      const k = `${gx},${gz}`;
      if (predicate === "blast") return hard.has(k);
      return hard.has(k) || soft.has(k);
    },
    occupiedCells() { return []; }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("findPath (S281)", () => {
  it("trivial: from === to returns single-cell path", () => {
    const occ = makeOccupancy(["..."]);
    expect(findPath(occ, { gx: 1, gz: 0 }, { gx: 1, gz: 0 })).toEqual([{ gx: 1, gz: 0 }]);
  });

  it("straight open corridor returns shortest path", () => {
    const occ = makeOccupancy(["....."]);
    const path = findPath(occ, { gx: 0, gz: 0 }, { gx: 4, gz: 0 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ gx: 0, gz: 0 });
    expect(path![path!.length - 1]).toEqual({ gx: 4, gz: 0 });
    expect(path!.length).toBe(5);
  });

  it("navigates around a hard wall", () => {
    // Open path exists to the right of the wall.
    //   . . # .
    //   . . . .
    const occ = makeOccupancy([
      "..#.",
      "....",
    ]);
    const path = findPath(occ, { gx: 0, gz: 0 }, { gx: 3, gz: 0 });
    expect(path).not.toBeNull();
    // Must not contain the hard block at (2, 0).
    expect(path!.some(c => c.gx === 2 && c.gz === 0)).toBe(false);
    expect(path![path!.length - 1]).toEqual({ gx: 3, gz: 0 });
  });

  it("returns null when no path exists (fully walled goal)", () => {
    const occ = makeOccupancy([
      ".#.",
      "###",
      "...",
    ]);
    expect(findPath(occ, { gx: 0, gz: 0 }, { gx: 2, gz: 0 })).toBeNull();
  });

  it("returns null when goal cell is hard-blocked", () => {
    const occ = makeOccupancy(["..#"]);
    expect(findPath(occ, { gx: 0, gz: 0 }, { gx: 2, gz: 0 })).toBeNull();
  });

  it("routes through soft block when it is the only path", () => {
    // Hard walls on N and S, only way through is the soft block at (1,0).
    //   . S .
    //   # # #
    const occ = makeOccupancy([
      ".S.",
      "###",
    ]);
    const path = findPath(occ, { gx: 0, gz: 0 }, { gx: 2, gz: 0 });
    expect(path).not.toBeNull();
    expect(path!.some(c => c.gx === 1 && c.gz === 0)).toBe(true);
  });

  it("prefers open path over soft blocks when detour is cheaper", () => {
    // Direct route through 3 soft cells, detour is all-open.
    //   . . . . .   gz=0  (all open)
    //   . S S S .   gz=1  (start / 3 soft / goal)
    const occ = makeOccupancy([
      ".....",
      ".SSS.",
    ]);
    // Direct (1,1)→S(2,1)→S(3,1)→S costs 3+3+3=9 (entering each soft cell).
    // Detour via gz=0 costs 1+1+1+1+1+1 = 6. Detour wins.
    const path = findPath(occ, { gx: 0, gz: 1 }, { gx: 4, gz: 1 }, { softBlockCost: 3 });
    expect(path).not.toBeNull();
    // Must avoid the soft cells (2,1) and (3,1) at minimum.
    expect(path!.some(c => c.gz === 0)).toBe(true); // uses the open row
  });

  it("respects maxIterations cap — returns null when budget exhausted", () => {
    // Large open grid, tiny budget.
    const rows = Array.from({ length: 10 }, () => "...........");
    const occ = makeOccupancy(rows);
    const path = findPath(occ, { gx: 0, gz: 0 }, { gx: 10, gz: 9 }, { maxIterations: 2 });
    expect(path).toBeNull();
  });

  it("softBlockCost determines when detour is preferred over soft-block route", () => {
    // 3-wide corridor: start(0,1) → soft(1,1) → goal(2,1).
    // Detour via open row: (0,1)→(0,0)→(1,0)→(2,0)→(2,1), cost=4.
    // Direct through soft: cost = softCost + 1.
    // softCost=3 → direct=4, detour=4 → tie (A* may pick either, both valid).
    // softCost=10 → direct=11, detour=4 → detour must be chosen.
    //   . . .   gz=0
    //   . S .   gz=1
    const occ = makeOccupancy(["...", ".S."]);
    const pathHighCost = findPath(occ, { gx: 0, gz: 1 }, { gx: 2, gz: 1 }, { softBlockCost: 10 });
    expect(pathHighCost).not.toBeNull();
    // With cost=10, detour (cost=4) dominates. Soft cell must be avoided.
    expect(pathHighCost!.some(c => c.gx === 1 && c.gz === 1)).toBe(false);
  });

  it("path starts at from and ends at to", () => {
    const occ = makeOccupancy([".....", ".....", "....."]);
    const from = { gx: 0, gz: 0 };
    const to = { gx: 4, gz: 2 };
    const path = findPath(occ, from, to);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual(from);
    expect(path![path!.length - 1]).toEqual(to);
  });

  it("path length equals Manhattan distance on open grid (optimal)", () => {
    const rows = Array.from({ length: 5 }, () => ".....");
    const occ = makeOccupancy(rows);
    const from = { gx: 0, gz: 0 };
    const to = { gx: 4, gz: 4 };
    const path = findPath(occ, from, to);
    expect(path).not.toBeNull();
    // Manhattan = |4-0| + |4-0| = 8; path has 9 cells (8 steps + start).
    expect(path!.length).toBe(9);
  });
});
