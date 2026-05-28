// S173 GDP-2026-05-28-010 — blast propagation respects cliff edges.
//
// Walker steps cardinal cells from origin and STOPS at the first
// height-delta edge it crosses (no BlastTile spawned beyond the cliff).
// Same hard-stop semantics as walking into a hard wall — the cliff acts
// as an impassable terrain feature for the blast.

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
    sizeX: 10,
    sizeZ: 10,
    originX: 0,
    originZ: 0
  });
  world.setComponent("grid.config", "Heightmap", { values });
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

describe("blast cliff stop (S173 GDP-2026-05-28-010)", () => {
  it("blast walking east hits a cliff at (gx 5, gz 5) → (gx 6, gz 5) and stops", () => {
    const world = new World();
    // Plateau in column 6+ at height 2; origin row (gz=5) flat 0..5,
    // height 2 from gx=6 onward.
    const heightmap: number[][] = [];
    for (let gz = 0; gz < 10; gz += 1) {
      const row: number[] = [];
      for (let gx = 0; gx < 10; gx += 1) {
        row.push(gx >= 6 ? 2 : 0);
      }
      heightmap.push(row);
    }
    seedGridAndHeightmap(world, heightmap);
    emitBlast(world, "blast-event.a", 3, 5, 5);

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy: occ });
    blast.fixedUpdate!(ctx(world));

    // Origin tile spawns.
    expect(countBlastTilesAt(world, 3, 5)).toBe(1);
    // East walker: gx=4 flat → tile; gx=5 flat → tile; gx=6 plateau → cliff between 5 and 6, walker stops.
    expect(countBlastTilesAt(world, 4, 5)).toBe(1);
    expect(countBlastTilesAt(world, 5, 5)).toBe(1);
    expect(countBlastTilesAt(world, 6, 5)).toBe(0);
    expect(countBlastTilesAt(world, 7, 5)).toBe(0);
  });

  it("blast walking down from a plateau also stops at the cliff edge", () => {
    const world = new World();
    // Single tall column at (5,5) height 2; surrounding flat.
    const heightmap: number[][] = [];
    for (let gz = 0; gz < 10; gz += 1) {
      const row: number[] = [];
      for (let gx = 0; gx < 10; gx += 1) {
        row.push(gx === 5 && gz === 5 ? 2 : 0);
      }
      heightmap.push(row);
    }
    seedGridAndHeightmap(world, heightmap);
    // Blast originates ON the plateau.
    emitBlast(world, "blast-event.a", 5, 5, 3);

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy: occ });
    blast.fixedUpdate!(ctx(world));

    // Origin spawns on the plateau.
    expect(countBlastTilesAt(world, 5, 5)).toBe(1);
    // No cardinal neighbour is at height 2 (all are 0) → every cardinal
    // step is a cliff edge → walker stops immediately in all four dirs.
    expect(countBlastTilesAt(world, 4, 5)).toBe(0);
    expect(countBlastTilesAt(world, 6, 5)).toBe(0);
    expect(countBlastTilesAt(world, 5, 4)).toBe(0);
    expect(countBlastTilesAt(world, 5, 6)).toBe(0);
  });

  it("on a flat arena (no heightmap) the blast walks the full range as before", () => {
    const world = new World();
    // Grid singleton only; no Heightmap component.
    world.addEntity("grid.config");
    world.setComponent("grid.config", "Grid", {
      cellSize: 1,
      sizeX: 10,
      sizeZ: 10,
      originX: 0,
      originZ: 0
    });
    emitBlast(world, "blast-event.a", 5, 5, 2);

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy: occ });
    blast.fixedUpdate!(ctx(world));

    let count = 0;
    for (const id of world.entityIds()) if (world.hasComponent(id, "BlastTile")) count += 1;
    expect(count).toBe(1 + 4 * 2); // origin + 2 per cardinal
  });
});
