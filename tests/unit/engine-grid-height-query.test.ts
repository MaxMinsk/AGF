// S173 GDP-2026-05-28-010 — variable cell height (MVP).
//
// Pure-helper tests for engine/grid/height-query. Exercises:
//   - getCellHeight returns 0 when no Heightmap singleton exists
//   - getCellHeight reads the height from a flat heightmap (all zeros)
//   - getCellHeight reads the height from a non-zero plateau
//   - getCellHeight is defensive: sparse rows, sparse columns, negative
//     indices, out-of-bounds indices all return 0 without throwing
//   - isCliffEdge returns false on a flat arena (no heightmap → 0 every
//     cell → matching heights)
//   - isCliffEdge returns true between cells whose heights differ
//   - isCliffEdge returns false for non-cardinal pairs (diagonal,
//     distance > 1) so probes-off-the-board don't spuriously block
//   - readHeightFromValues exposed for callers with the values array
//     already in hand (no world lookup needed)

import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import {
  getCellHeight,
  isCliffEdge,
  readHeightFromValues
} from "../../engine/grid/height-query";

function makeWorldWithGrid(): World {
  const world = new World();
  world.addEntity("grid.config");
  world.setComponent("grid.config", "Grid", {
    cellSize: 1,
    sizeX: 8,
    sizeZ: 8,
    originX: 0,
    originZ: 0
  });
  return world;
}

function addHeightmap(world: World, values: number[][]): void {
  world.setComponent("grid.config", "Heightmap", { values });
}

describe("engine/grid/height-query (S173)", () => {
  describe("getCellHeight", () => {
    it("returns 0 when no Heightmap singleton exists", () => {
      const world = makeWorldWithGrid();
      expect(getCellHeight(world, 3, 3)).toBe(0);
      expect(getCellHeight(world, 0, 0)).toBe(0);
    });

    it("returns 0 for every cell on a flat (all-zero) heightmap", () => {
      const world = makeWorldWithGrid();
      addHeightmap(world, [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ]);
      expect(getCellHeight(world, 0, 0)).toBe(0);
      expect(getCellHeight(world, 2, 1)).toBe(0);
    });

    it("returns the authored cell height for a plateau", () => {
      const world = makeWorldWithGrid();
      addHeightmap(world, [
        [0, 0, 0, 0, 0],
        [0, 2, 2, 0, 0],
        [0, 2, 2, 0, 0],
        [0, 0, 0, 0, 0]
      ]);
      // Plateau cells.
      expect(getCellHeight(world, 1, 1)).toBe(2);
      expect(getCellHeight(world, 2, 2)).toBe(2);
      // Surrounding flat cells.
      expect(getCellHeight(world, 0, 1)).toBe(0);
      expect(getCellHeight(world, 3, 2)).toBe(0);
    });

    it("returns 0 for negative indices", () => {
      const world = makeWorldWithGrid();
      addHeightmap(world, [[1, 1], [1, 1]]);
      expect(getCellHeight(world, -1, 0)).toBe(0);
      expect(getCellHeight(world, 0, -1)).toBe(0);
    });

    it("returns 0 for out-of-bounds indices (sparse rows/columns)", () => {
      const world = makeWorldWithGrid();
      addHeightmap(world, [
        [1, 1, 1],
        [1] // shorter than other rows
        // no third row
      ]);
      // row 0 col 2 — exists
      expect(getCellHeight(world, 2, 0)).toBe(1);
      // row 1 col 2 — row is short
      expect(getCellHeight(world, 2, 1)).toBe(0);
      // row 5 — missing
      expect(getCellHeight(world, 0, 5)).toBe(0);
    });

    it("does not require the Heightmap to live on the same entity as Grid", () => {
      const world = new World();
      // No Grid component at all — Heightmap on a generic singleton.
      world.addEntity("heightmap-singleton");
      world.setComponent("heightmap-singleton", "Heightmap", { values: [[3, 3], [3, 3]] });
      expect(getCellHeight(world, 0, 0)).toBe(3);
      expect(getCellHeight(world, 1, 1)).toBe(3);
    });
  });

  describe("isCliffEdge", () => {
    it("returns false on a flat arena (no heightmap)", () => {
      const world = makeWorldWithGrid();
      expect(isCliffEdge(world, 1, 1, 2, 1)).toBe(false);
      expect(isCliffEdge(world, 1, 1, 1, 2)).toBe(false);
    });

    it("returns false between two cells of equal height", () => {
      const world = makeWorldWithGrid();
      addHeightmap(world, [
        [2, 2, 2],
        [2, 2, 2],
        [2, 2, 2]
      ]);
      expect(isCliffEdge(world, 0, 0, 1, 0)).toBe(false);
      expect(isCliffEdge(world, 1, 1, 2, 1)).toBe(false);
    });

    it("returns true when stepping from flat onto a plateau (height delta = 2)", () => {
      const world = makeWorldWithGrid();
      addHeightmap(world, [
        [0, 0, 0],
        [0, 2, 0],
        [0, 0, 0]
      ]);
      // (0,1) flat → (1,1) plateau
      expect(isCliffEdge(world, 0, 1, 1, 1)).toBe(true);
      // Reverse: stepping down the cliff is equally cliff.
      expect(isCliffEdge(world, 1, 1, 0, 1)).toBe(true);
    });

    it("S179 — returns false for a single-step delta (bombers can climb ±1)", () => {
      const world = makeWorldWithGrid();
      addHeightmap(world, [
        [0, 1],
        [0, 1]
      ]);
      expect(isCliffEdge(world, 0, 0, 1, 0)).toBe(false);
      // Reverse direction: stepping down 1 is equally free.
      expect(isCliffEdge(world, 1, 0, 0, 0)).toBe(false);
    });

    it("S179 — staircase traversal: each H=0→1→2 step is passable", () => {
      const world = makeWorldWithGrid();
      addHeightmap(world, [
        [0, 1, 2]
      ]);
      expect(isCliffEdge(world, 0, 0, 1, 0)).toBe(false);
      expect(isCliffEdge(world, 1, 0, 2, 0)).toBe(false);
    });

    it("returns false for diagonal pairs (only cardinals are cliffs)", () => {
      const world = makeWorldWithGrid();
      addHeightmap(world, [
        [0, 0, 0],
        [0, 2, 0],
        [0, 0, 0]
      ]);
      // (0,0) → (1,1) is diagonal, not a cardinal step.
      expect(isCliffEdge(world, 0, 0, 1, 1)).toBe(false);
    });

    it("returns false for non-adjacent cells (distance > 1)", () => {
      const world = makeWorldWithGrid();
      addHeightmap(world, [
        [0, 0, 0, 0],
        [0, 2, 2, 0],
        [0, 0, 0, 0]
      ]);
      // (0,1) and (3,1) differ in height but are 3 cells apart.
      expect(isCliffEdge(world, 0, 1, 3, 1)).toBe(false);
    });

    it("returns false when from and to are the same cell", () => {
      const world = makeWorldWithGrid();
      addHeightmap(world, [[2]]);
      expect(isCliffEdge(world, 0, 0, 0, 0)).toBe(false);
    });
  });

  describe("readHeightFromValues (utility)", () => {
    it("reads in [gz][gx] order", () => {
      const values = [
        [0, 0, 0],
        [0, 4, 0]
      ];
      expect(readHeightFromValues(values, 1, 1)).toBe(4);
      expect(readHeightFromValues(values, 0, 0)).toBe(0);
    });

    it("defaults missing entries to 0", () => {
      expect(readHeightFromValues([], 0, 0)).toBe(0);
      expect(readHeightFromValues([[]], 0, 0)).toBe(0);
      // @ts-expect-error -- exercise the runtime defensive guard.
      expect(readHeightFromValues([[null]], 0, 0)).toBe(0);
    });
  });
});
