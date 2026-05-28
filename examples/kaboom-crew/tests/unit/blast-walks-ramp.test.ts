// S174 GDP-2026-05-28-011 — Ramps. The blast walker now respects ramp
// suppression: a blast walking east from a flat cell into a ramp cell
// and onto the to-cell passes through, while a blast walking into a
// cliff WITHOUT a ramp still stops.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { createKaboomBlastPropagationSystem } from "../../src/systems/blast-propagation-system";

function ctx(world: World, fixedDt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

function seedGridAndHeightmap(world: World, values: number[][]): void {
  world.addEntity("grid.config");
  world.setComponent("grid.config", "Grid", {
    cellSize: 1,
    sizeX: 12,
    sizeZ: 12,
    originX: 0,
    originZ: 0
  });
  world.setComponent("grid.config", "Heightmap", { values });
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

function emitBlast(world: World, eventId: string, originGx: number, originGz: number, range: number, ownerId = "player.1"): void {
  world.addEntity(eventId);
  world.setComponent(eventId, "BlastEvent", { originGx, originGz, range, ownerId });
}

function countBlastTilesAt(world: World, gx: number, gz: number): number {
  let n = 0;
  for (const id of world.entityIds()) {
    if (!world.hasComponent(id, "BlastTile")) continue;
    const pos = world.getComponent<{ gx: number; gz: number }>(id, "GridPosition");
    if (pos !== undefined && pos.gx === gx && pos.gz === gz) n += 1;
  }
  return n;
}

describe("blast walks ramp (S174)", () => {
  it("east-walking blast from H=0 passes through a single ramp cell onto the H=1 plateau", () => {
    const world = new World();
    // Plateau column at gx >= 5 height 1; ramp at (gx=4, gz=5) bridges
    // (4,5) → (5,5). NOTE: the ramp cell itself sits at heightmap = 0
    // (fromHeight). (5,5) is the to-cell at heightmap = 1.
    const heightmap: number[][] = [];
    for (let gz = 0; gz < 12; gz += 1) {
      const row: number[] = [];
      for (let gx = 0; gx < 12; gx += 1) {
        row.push(gx >= 5 ? 1 : 0);
      }
      heightmap.push(row);
    }
    seedGridAndHeightmap(world, heightmap);
    addRamp(world, "ramp.east", 4, 5, 0, 1, "E");
    emitBlast(world, "blast-event.a", 2, 5, 5);

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy: occ });
    blast.fixedUpdate!(ctx(world));

    // Walker steps: (2,5) origin, (3,5), (4,5) ramp, (5,5) plateau,
    // (6,5) plateau, (7,5) plateau. The cliff between (4,5) and (5,5)
    // is suppressed by the ramp; the cell pair (5,5)↔(6,5) is flat
    // (both H=1) so the walker continues to range.
    expect(countBlastTilesAt(world, 2, 5)).toBe(1); // origin
    expect(countBlastTilesAt(world, 3, 5)).toBe(1);
    expect(countBlastTilesAt(world, 4, 5)).toBe(1); // ramp cell
    expect(countBlastTilesAt(world, 5, 5)).toBe(1); // plateau cell across ramp
    expect(countBlastTilesAt(world, 6, 5)).toBe(1);
    expect(countBlastTilesAt(world, 7, 5)).toBe(1); // last cell in range (range=5)
  });

  it("east-walking blast at the row WITHOUT a ramp still hits the cliff and stops", () => {
    const world = new World();
    // Same plateau as above but ramp only on row gz=5. Blast on
    // gz=4 should stop at the cliff.
    const heightmap: number[][] = [];
    for (let gz = 0; gz < 12; gz += 1) {
      const row: number[] = [];
      for (let gx = 0; gx < 12; gx += 1) {
        row.push(gx >= 5 ? 1 : 0);
      }
      heightmap.push(row);
    }
    seedGridAndHeightmap(world, heightmap);
    addRamp(world, "ramp.east", 4, 5, 0, 1, "E");
    // Blast on row gz=4 (no ramp). Origin at (2, 4) range 5.
    emitBlast(world, "blast-event.a", 2, 4, 5);

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy: occ });
    blast.fixedUpdate!(ctx(world));

    // (2,4) origin, (3,4) flat, (4,4) flat → tile; (5,4) is across
    // the cliff → walker stops.
    expect(countBlastTilesAt(world, 2, 4)).toBe(1);
    expect(countBlastTilesAt(world, 3, 4)).toBe(1);
    expect(countBlastTilesAt(world, 4, 4)).toBe(1);
    expect(countBlastTilesAt(world, 5, 4)).toBe(0);
    expect(countBlastTilesAt(world, 6, 4)).toBe(0);
  });

  it("descending blast: bomb on plateau, blast walks DOWN through a ramp to the flat", () => {
    const world = new World();
    const heightmap: number[][] = [];
    for (let gz = 0; gz < 12; gz += 1) {
      const row: number[] = [];
      for (let gx = 0; gx < 12; gx += 1) {
        row.push(gx >= 5 ? 1 : 0);
      }
      heightmap.push(row);
    }
    seedGridAndHeightmap(world, heightmap);
    addRamp(world, "ramp.east", 4, 5, 0, 1, "E");
    // Bomb on plateau cell (6, 5). Blast walks west.
    emitBlast(world, "blast-event.a", 6, 5, 5);

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy: occ });
    blast.fixedUpdate!(ctx(world));

    // (6,5) origin → tile; (5,5) plateau same height → tile;
    // (4,5) ramp (descending) → ramp suppresses cliff → tile;
    // (3,5), (2,5), (1,5) flat continues to range.
    expect(countBlastTilesAt(world, 6, 5)).toBe(1);
    expect(countBlastTilesAt(world, 5, 5)).toBe(1);
    expect(countBlastTilesAt(world, 4, 5)).toBe(1); // descended through ramp
    expect(countBlastTilesAt(world, 3, 5)).toBe(1);
    expect(countBlastTilesAt(world, 2, 5)).toBe(1);
    expect(countBlastTilesAt(world, 1, 5)).toBe(1);
  });
});
