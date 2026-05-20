// S98 KABOOM-BLAST-DANGER-DECAL — prediction-overlay system tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomDangerDecalSystem } from "../../src/systems/danger-decal-system";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomb(world: World, id: string, gx: number, gz: number, fuseRemaining: number, range = 2): void {
  world.addEntity(id);
  world.setComponent(id, "Bomb", { fuseRemaining, range, ownerId: "owner" });
  world.setComponent(id, "GridPosition", { gx, gz });
}

function dangerCells(world: World): Array<{ gx: number; gz: number }> {
  const out: Array<{ gx: number; gz: number }> = [];
  for (const id of world.createQuery(["DangerTile", "GridPosition"]).run()) {
    const pos = world.getComponent(id, "GridPosition") as { gx: number; gz: number };
    out.push({ gx: pos.gx, gz: pos.gz });
  }
  return out.sort((a, b) => a.gx - b.gx || a.gz - b.gz);
}

describe("createKaboomDangerDecalSystem (S98 KABOOM-BLAST-DANGER-DECAL)", () => {
  it("no bombs → no DangerTiles", () => {
    const world = new World();
    const system = createKaboomDangerDecalSystem();
    system.fixedUpdate!(ctx(world));
    expect(dangerCells(world)).toEqual([]);
  });

  it("bomb with fuseRemaining = 2 (above default 1 s threshold) → no DangerTiles", () => {
    const world = new World();
    addBomb(world, "bomb.1", 5, 5, 2.0, 2);
    const system = createKaboomDangerDecalSystem();
    system.fixedUpdate!(ctx(world));
    expect(dangerCells(world)).toEqual([]);
  });

  it("bomb with fuseRemaining = 0.5 spawns DangerTiles for the center + every cell in range", () => {
    const world = new World();
    addBomb(world, "bomb.1", 5, 5, 0.5, 2);
    const system = createKaboomDangerDecalSystem();
    system.fixedUpdate!(ctx(world));
    const cells = dangerCells(world);
    // Center + 2-cell fan in each cardinal: 1 + 4*2 = 9 cells.
    expect(cells.length).toBe(9);
    // Center exists.
    expect(cells.some((c) => c.gx === 5 && c.gz === 5)).toBe(true);
    // Cardinal tips exist (range = 2 from center).
    expect(cells.some((c) => c.gx === 7 && c.gz === 5)).toBe(true); // +X
    expect(cells.some((c) => c.gx === 3 && c.gz === 5)).toBe(true); // -X
    expect(cells.some((c) => c.gx === 5 && c.gz === 7)).toBe(true); // +Z
    expect(cells.some((c) => c.gx === 5 && c.gz === 3)).toBe(true); // -Z
  });

  it("removing the bomb removes its DangerTiles on the next tick", () => {
    const world = new World();
    addBomb(world, "bomb.1", 5, 5, 0.5, 1);
    const system = createKaboomDangerDecalSystem();
    system.fixedUpdate!(ctx(world));
    expect(dangerCells(world).length).toBeGreaterThan(0);
    world.removeEntity("bomb.1");
    system.fixedUpdate!(ctx(world));
    expect(dangerCells(world)).toEqual([]);
  });

  it("hard-block GridOccupant stops the projected fan", () => {
    const world = new World();
    addBomb(world, "bomb.1", 5, 5, 0.5, 5);
    // Hard block at (7, 5) — blocks the +X fan after the cell BEFORE it.
    world.addEntity("wall.1");
    world.setComponent("wall.1", "GridPosition", { gx: 7, gz: 5 });
    world.setComponent("wall.1", "GridOccupant", { layer: "hard", blocksMovement: true, blocksBlast: true });
    const system = createKaboomDangerDecalSystem();
    system.fixedUpdate!(ctx(world));
    const cells = dangerCells(world);
    // +X fan: should include (6, 5) but NOT (7, 5) (blocked) or (8, 5)+.
    expect(cells.some((c) => c.gx === 6 && c.gz === 5)).toBe(true);
    expect(cells.some((c) => c.gx === 7 && c.gz === 5)).toBe(false);
    expect(cells.some((c) => c.gx === 8 && c.gz === 5)).toBe(false);
    // -X fan still walks unobstructed.
    expect(cells.some((c) => c.gx === 4 && c.gz === 5)).toBe(true);
  });

  it("fuse decreasing past the threshold (steady-state from above) is observed on the first <1s tick", () => {
    const world = new World();
    addBomb(world, "bomb.1", 0, 0, 1.5, 1);
    const system = createKaboomDangerDecalSystem();
    system.fixedUpdate!(ctx(world));
    expect(dangerCells(world).length).toBe(0);
    // Simulate the fuse system decrementing it under the threshold.
    world.setComponent("bomb.1", "Bomb", { fuseRemaining: 0.5, range: 1, ownerId: "owner" });
    system.fixedUpdate!(ctx(world));
    expect(dangerCells(world).length).toBeGreaterThan(0);
  });

  it("fuse extending above the threshold removes DangerTiles", () => {
    const world = new World();
    addBomb(world, "bomb.1", 0, 0, 0.5, 1);
    const system = createKaboomDangerDecalSystem();
    system.fixedUpdate!(ctx(world));
    expect(dangerCells(world).length).toBeGreaterThan(0);
    world.setComponent("bomb.1", "Bomb", { fuseRemaining: 1.5, range: 1, ownerId: "owner" });
    system.fixedUpdate!(ctx(world));
    expect(dangerCells(world)).toEqual([]);
  });

  it("custom warningFuseSeconds threshold", () => {
    const world = new World();
    addBomb(world, "bomb.1", 0, 0, 0.4, 1);
    const system = createKaboomDangerDecalSystem({ warningFuseSeconds: 0.3 });
    system.fixedUpdate!(ctx(world));
    expect(dangerCells(world)).toEqual([]);
    // Drop fuse below the custom threshold.
    world.setComponent("bomb.1", "Bomb", { fuseRemaining: 0.2, range: 1, ownerId: "owner" });
    system.fixedUpdate!(ctx(world));
    expect(dangerCells(world).length).toBeGreaterThan(0);
  });
});
