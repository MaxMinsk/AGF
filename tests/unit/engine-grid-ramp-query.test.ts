// S174 GDP-2026-05-28-011 — Ramps (MVP).
//
// Pure-helper tests for engine/grid/ramp-query. Exercises:
//   - getRampAt returns the Ramp component for cells that carry it +
//     undefined for cells that don't (incl. unrelated entities sharing
//     a cell);
//   - rampDirectionDelta maps N/E/S/W to the expected (dx, dz) pairs;
//   - isRampEdge returns true for the ramp cell → to-cell direction
//     AND for the reverse (descending the ramp), false otherwise
//     (other neighbours of the ramp cell, diagonals, distance > 1,
//     unrelated cell pairs);
//   - rampStandOnHeight returns the midpoint on a ramp cell + the
//     base cell height on non-ramp cells.

import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import {
  getRampAt,
  isRampEdge,
  rampDirectionDelta,
  rampStandOnHeight
} from "../../engine/grid/ramp-query";

function makeWorld(): World {
  return new World();
}

function addRamp(
  world: World,
  id: string,
  gx: number,
  gz: number,
  fromHeight: number,
  toHeight: number,
  direction: "N" | "E" | "S" | "W"
): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Ramp", { fromHeight, toHeight, direction });
}

describe("engine/grid/ramp-query (S174)", () => {
  describe("rampDirectionDelta", () => {
    it("maps N/E/S/W to unit vectors (Z+ is south)", () => {
      expect(rampDirectionDelta("N")).toEqual({ dx: 0, dz: -1 });
      expect(rampDirectionDelta("E")).toEqual({ dx: 1, dz: 0 });
      expect(rampDirectionDelta("S")).toEqual({ dx: 0, dz: 1 });
      expect(rampDirectionDelta("W")).toEqual({ dx: -1, dz: 0 });
    });
  });

  describe("getRampAt", () => {
    it("returns undefined when no ramp lives on the cell", () => {
      const world = makeWorld();
      addRamp(world, "ramp.a", 5, 5, 0, 1, "E");
      expect(getRampAt(world, 4, 4)).toBeUndefined();
      expect(getRampAt(world, 5, 4)).toBeUndefined();
    });

    it("returns the Ramp data when an entity at the cell carries it", () => {
      const world = makeWorld();
      addRamp(world, "ramp.a", 5, 5, 0, 1, "E");
      expect(getRampAt(world, 5, 5)).toEqual({ fromHeight: 0, toHeight: 1, direction: "E" });
    });

    it("ignores entities that share the cell but don't carry Ramp", () => {
      const world = makeWorld();
      // Wall on the cell; no ramp.
      world.addEntity("wall.a");
      world.setComponent("wall.a", "GridPosition", { gx: 3, gz: 3 });
      expect(getRampAt(world, 3, 3)).toBeUndefined();
    });

    it("handles a chain of ramps in series (each cell carries its own Ramp)", () => {
      const world = makeWorld();
      addRamp(world, "ramp.low", 4, 5, 0, 1, "E");
      addRamp(world, "ramp.high", 5, 5, 1, 2, "E");
      expect(getRampAt(world, 4, 5)).toEqual({ fromHeight: 0, toHeight: 1, direction: "E" });
      expect(getRampAt(world, 5, 5)).toEqual({ fromHeight: 1, toHeight: 2, direction: "E" });
    });
  });

  describe("isRampEdge", () => {
    it("returns true climbing the ramp (from ramp cell to to-cell)", () => {
      const world = makeWorld();
      addRamp(world, "ramp.a", 5, 5, 0, 1, "E");
      // Ramp at (5,5) points east → (6,5).
      expect(isRampEdge(world, 5, 5, 6, 5)).toBe(true);
    });

    it("returns true descending the ramp (from to-cell back to ramp cell)", () => {
      const world = makeWorld();
      addRamp(world, "ramp.a", 5, 5, 0, 1, "E");
      // Reverse of the climb: (6,5) → (5,5).
      expect(isRampEdge(world, 6, 5, 5, 5)).toBe(true);
    });

    it("returns false for the other neighbours of the ramp cell", () => {
      const world = makeWorld();
      addRamp(world, "ramp.a", 5, 5, 0, 1, "E");
      // West, north, south of the ramp cell — none of these are the
      // ramp's endpoint pair. Movement / blast code falls back to
      // isCliffEdge for these.
      expect(isRampEdge(world, 5, 5, 4, 5)).toBe(false);
      expect(isRampEdge(world, 5, 5, 5, 4)).toBe(false);
      expect(isRampEdge(world, 5, 5, 5, 6)).toBe(false);
    });

    it("returns false for unrelated cell pairs (no ramp involved)", () => {
      const world = makeWorld();
      addRamp(world, "ramp.a", 5, 5, 0, 1, "E");
      expect(isRampEdge(world, 1, 1, 2, 1)).toBe(false);
    });

    it("returns false for diagonal pairs", () => {
      const world = makeWorld();
      addRamp(world, "ramp.a", 5, 5, 0, 1, "E");
      expect(isRampEdge(world, 5, 5, 6, 6)).toBe(false);
    });

    it("returns false for distance > 1 cells", () => {
      const world = makeWorld();
      addRamp(world, "ramp.a", 5, 5, 0, 1, "E");
      expect(isRampEdge(world, 5, 5, 7, 5)).toBe(false);
    });

    it("returns false for same-cell pairs", () => {
      const world = makeWorld();
      addRamp(world, "ramp.a", 5, 5, 0, 1, "E");
      expect(isRampEdge(world, 5, 5, 5, 5)).toBe(false);
    });

    it("handles N / S / W directions correctly", () => {
      const world = makeWorld();
      addRamp(world, "ramp.n", 1, 5, 0, 1, "N"); // climbs to (1, 4)
      addRamp(world, "ramp.s", 2, 5, 0, 1, "S"); // climbs to (2, 6)
      addRamp(world, "ramp.w", 3, 5, 0, 1, "W"); // climbs to (2, 5)
      expect(isRampEdge(world, 1, 5, 1, 4)).toBe(true);
      expect(isRampEdge(world, 2, 5, 2, 6)).toBe(true);
      expect(isRampEdge(world, 3, 5, 2, 5)).toBe(true);
      // Reverse of each:
      expect(isRampEdge(world, 1, 4, 1, 5)).toBe(true);
      expect(isRampEdge(world, 2, 6, 2, 5)).toBe(true);
      expect(isRampEdge(world, 2, 5, 3, 5)).toBe(true);
    });
  });

  describe("rampStandOnHeight", () => {
    it("returns the base cell height when no ramp lives on the cell", () => {
      const world = makeWorld();
      // No ramps; flat cell H=2 → stand-on Y = 2.
      expect(rampStandOnHeight(world, 5, 5, 2)).toBe(2);
    });

    it("returns the midpoint between fromHeight and toHeight on a ramp cell", () => {
      const world = makeWorld();
      addRamp(world, "ramp.a", 5, 5, 0, 1, "E");
      // Midpoint of [0, 1] = 0.5; base cell height irrelevant.
      expect(rampStandOnHeight(world, 5, 5, 0)).toBe(0.5);
    });

    it("midpoint scales with the ramp's heights (e.g. 1 → 2 ramp midpoint = 1.5)", () => {
      const world = makeWorld();
      addRamp(world, "ramp.high", 6, 5, 1, 2, "E");
      expect(rampStandOnHeight(world, 6, 5, 1)).toBe(1.5);
    });
  });
});
