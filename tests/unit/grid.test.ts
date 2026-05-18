// S81 KABOOM-GRID-POSITION unit tests for the pure conversion helpers.

import { describe, expect, it } from "vitest";

import { cellKey, gridToWorld, isInBounds, parseCellKey, worldToGrid } from "../../engine/core/grid";

const GRID = { cellSize: 1, sizeX: 15, sizeZ: 11, originX: 0, originZ: 0 };

describe("engine/core/grid", () => {
  it("gridToWorld maps cells to centred world positions", () => {
    expect(gridToWorld(GRID, 0, 0)).toEqual([0, 0, 0]);
    expect(gridToWorld(GRID, 7, 5)).toEqual([7, 0, 5]);
  });

  it("worldToGrid is the inverse of gridToWorld (round-trip)", () => {
    for (let gx = 0; gx < GRID.sizeX; gx++) {
      for (let gz = 0; gz < GRID.sizeZ; gz++) {
        const [wx, , wz] = gridToWorld(GRID, gx, gz);
        const back = worldToGrid(GRID, wx, wz);
        expect(back).toEqual({ gx, gz });
      }
    }
  });

  it("worldToGrid rounds half-cell offsets to the nearest cell", () => {
    expect(worldToGrid(GRID, 0.49, 0)).toEqual({ gx: 0, gz: 0 });
    expect(worldToGrid(GRID, 0.5, 0)).toEqual({ gx: 1, gz: 0 });
  });

  it("origin offset shifts the entire grid", () => {
    const shifted = { ...GRID, originX: 10, originZ: -5 };
    expect(gridToWorld(shifted, 0, 0)).toEqual([10, 0, -5]);
    expect(worldToGrid(shifted, 10, -5)).toEqual({ gx: 0, gz: 0 });
  });

  it("non-unit cellSize scales conversions", () => {
    const big = { cellSize: 2, sizeX: 5, sizeZ: 5 };
    expect(gridToWorld(big, 2, 3)).toEqual([4, 0, 6]);
    expect(worldToGrid(big, 4, 6)).toEqual({ gx: 2, gz: 3 });
  });

  it("isInBounds detects out-of-range cells", () => {
    expect(isInBounds(GRID, 0, 0)).toBe(true);
    expect(isInBounds(GRID, 14, 10)).toBe(true);
    expect(isInBounds(GRID, -1, 0)).toBe(false);
    expect(isInBounds(GRID, 15, 0)).toBe(false);
    expect(isInBounds(GRID, 0, 11)).toBe(false);
  });

  it("cellKey + parseCellKey round-trip", () => {
    expect(cellKey(3, 7)).toBe("3|7");
    expect(parseCellKey("3|7")).toEqual({ gx: 3, gz: 7 });
    expect(parseCellKey(cellKey(0, 0))).toEqual({ gx: 0, gz: 0 });
  });

  it("parseCellKey throws on malformed input", () => {
    expect(() => parseCellKey("nope")).toThrow();
  });
});
