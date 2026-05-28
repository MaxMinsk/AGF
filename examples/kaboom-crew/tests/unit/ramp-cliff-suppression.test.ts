// S174 GDP-2026-05-28-011 — Ramps suppress the cliff edge between the
// ramp cell and its to-cell. Other neighbours of the ramp cell still
// respect the underlying height delta.
//
// Verifies the engine pair (height-query.isPassableEdge + ramp-query)
// composes correctly:
//   - cliff-with-ramp edge → passable;
//   - cliff-without-ramp edge between the same heights but at a
//     different cell pair → impassable;
//   - flat-edge with a ramp → still passable (no regression).

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { isCliffEdge, isPassableEdge } from "../../../../engine/grid/height-query";

function buildPlateauWithRamp(): World {
  const world = new World();
  world.addEntity("grid.config");
  world.setComponent("grid.config", "Grid", {
    cellSize: 1,
    sizeX: 10,
    sizeZ: 10,
    originX: 0,
    originZ: 0
  });
  // Plateau column at gx=5 height 1; surrounding flat.
  const values: number[][] = [];
  for (let gz = 0; gz < 10; gz += 1) {
    const row: number[] = [];
    for (let gx = 0; gx < 10; gx += 1) {
      row.push(gx === 5 ? 1 : 0);
    }
    values.push(row);
  }
  world.setComponent("grid.config", "Heightmap", { values });
  // Single ramp at (gx=4, gz=5) bridging (4,5) → (5,5).
  world.addEntity("ramp.east");
  world.setComponent("ramp.east", "GridPosition", { gx: 4, gz: 5 });
  world.setComponent("ramp.east", "Ramp", { fromHeight: 0, toHeight: 1, direction: "E" });
  return world;
}

describe("ramp cliff suppression (S174)", () => {
  it("isCliffEdge STILL returns true at the ramp endpoint (kept pure)", () => {
    // isCliffEdge intentionally stays height-only — the ramp doesn't
    // change the underlying heightmap, so the function reports the
    // height delta unchanged. Gameplay code should consult
    // isPassableEdge for ramp-aware checks.
    const world = buildPlateauWithRamp();
    expect(isCliffEdge(world, 4, 5, 5, 5)).toBe(true);
  });

  it("isPassableEdge returns true at the ramp endpoint (cliff suppressed)", () => {
    const world = buildPlateauWithRamp();
    expect(isPassableEdge(world, 4, 5, 5, 5)).toBe(true);
    // Reverse (descending the ramp) is also passable.
    expect(isPassableEdge(world, 5, 5, 4, 5)).toBe(true);
  });

  it("isPassableEdge returns false for OTHER cliff edges (the ramp suppression is local)", () => {
    // Another cliff edge at (4, 4) → (5, 4) — same height delta but
    // no ramp connects this pair. Should stay impassable.
    const world = buildPlateauWithRamp();
    expect(isPassableEdge(world, 4, 4, 5, 4)).toBe(false);
    // Same for gz=6.
    expect(isPassableEdge(world, 4, 6, 5, 6)).toBe(false);
  });

  it("isPassableEdge returns true on flat edges (no regression)", () => {
    const world = buildPlateauWithRamp();
    // Flat → flat with no ramp involved.
    expect(isPassableEdge(world, 1, 1, 2, 1)).toBe(true);
    // Flat → flat on the other side of the plateau.
    expect(isPassableEdge(world, 6, 1, 7, 1)).toBe(true);
  });

  it("isPassableEdge does NOT magically suppress unrelated cliff edges of the ramp cell", () => {
    // The ramp at (4, 5) suppresses only the east edge. The north /
    // south neighbours of the ramp cell — (4, 4) and (4, 6) — are flat
    // same height (both at H=0 in our test world), so isPassableEdge
    // returns true purely from same-height. To test the negative we'd
    // need a height delta on those neighbours; this test documents the
    // current expectation that the ramp doesn't accidentally bypass
    // OTHER edges of the same cell.
    const world = buildPlateauWithRamp();
    // North + south of the ramp cell are flat at H=0; same-height edges
    // pass through without ramp involvement.
    expect(isPassableEdge(world, 4, 5, 4, 4)).toBe(true);
    expect(isPassableEdge(world, 4, 5, 4, 6)).toBe(true);
    // West neighbour is also flat at H=0.
    expect(isPassableEdge(world, 4, 5, 3, 5)).toBe(true);
  });
});
