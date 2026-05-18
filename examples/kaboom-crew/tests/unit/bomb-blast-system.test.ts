// S82 KABOOM-BOMB-FUSE-BLAST + KABOOM-DAMAGE-AND-DEATH unit tests.
// Exercises the full pipeline: fuse tick → BlastEvent → propagation →
// soft-block destruction → chain reaction → bomber damage → tile fade.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { createKaboomBombFuseSystem } from "../../src/systems/bomb-fuse-system";
import { createKaboomBlastPropagationSystem } from "../../src/systems/blast-propagation-system";
import { createKaboomBlastTileLifetimeSystem } from "../../src/systems/blast-tile-lifetime-system";

function ctx(world: World, fixedDt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomb(world: World, id: string, gx: number, gz: number, opts: { fuse?: number; range?: number; owner?: string } = {}): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "bomb", blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "Bomb", {
    fuseRemaining: opts.fuse ?? 1 / 60, // detonate on the first step by default
    range: opts.range ?? 2,
    ownerId: opts.owner ?? "player.1"
  });
}

function addSoftBlock(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "block", blocksMovement: true, blocksBlast: false });
}

function addHardWall(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "wall", blocksMovement: true, blocksBlast: true });
}

function addBomber(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: id, blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, activeBombs: 1, alive: true });
}

describe("Kaboom bomb pipeline (S82)", () => {
  it("fuse ticks down + emits a BlastEvent at zero, deletes bomb, decrements activeBombs", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5); // gives BomberStats with activeBombs=1
    addBomb(world, "bomb.a", 5, 5, { fuse: 1 / 60, owner: "player.1" });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const fuse = createKaboomBombFuseSystem();
    fuse.fixedUpdate!(ctx(world));
    // Bomb should be gone; a BlastEvent should exist somewhere.
    expect(world.hasEntity("bomb.a")).toBe(false);
    const events: string[] = [];
    for (const id of world.entityIds()) {
      if (world.hasComponent(id, "BlastEvent")) events.push(id);
    }
    expect(events).toHaveLength(1);
    const stats = world.getComponent("player.1", "BomberStats") as { activeBombs: number };
    expect(stats.activeBombs).toBe(0);
  });

  it("blast propagation: range=2 spawns 1+4*2 = 9 blast tiles in open space", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5);
    addBomb(world, "bomb.a", 5, 5, { fuse: 1 / 60, range: 2 });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const fuse = createKaboomBombFuseSystem();
    fuse.fixedUpdate!(ctx(world));
    // Rebuild occupancy so the propagation system sees the BlastEvent
    // entity / bomb removal.
    occ.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy: occ });
    blast.fixedUpdate!(ctx(world));
    let tiles = 0;
    for (const id of world.entityIds()) {
      if (world.hasComponent(id, "BlastTile")) tiles += 1;
    }
    expect(tiles).toBe(1 + 4 * 2); // origin + 2 cells per cardinal
  });

  it("blast stops at a hard wall (wall survives)", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5);
    addBomb(world, "bomb.a", 5, 5, { fuse: 1 / 60, range: 3 });
    addHardWall(world, "wall.east", 7, 5); // stops eastbound chain
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const fuse = createKaboomBombFuseSystem();
    fuse.fixedUpdate!(ctx(world));
    occ.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy: occ });
    blast.fixedUpdate!(ctx(world));
    // No blast tile on the wall cell.
    let onWall = false;
    for (const id of world.entityIds()) {
      const tile = world.getComponent(id, "BlastTile");
      const pos = world.getComponent(id, "GridPosition") as { gx: number; gz: number } | undefined;
      if (tile !== undefined && pos?.gx === 7 && pos?.gz === 5) onWall = true;
    }
    expect(onWall).toBe(false);
    expect(world.hasEntity("wall.east")).toBe(true);
  });

  it("blast destroys a soft block and stops at the same cell", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5);
    addBomb(world, "bomb.a", 5, 5, { fuse: 1 / 60, range: 3 });
    addSoftBlock(world, "soft.east", 6, 5);
    addSoftBlock(world, "soft.east-2", 7, 5); // shielded by soft.east
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const fuse = createKaboomBombFuseSystem();
    fuse.fixedUpdate!(ctx(world));
    occ.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy: occ });
    blast.fixedUpdate!(ctx(world));
    expect(world.hasEntity("soft.east")).toBe(false);
    expect(world.hasEntity("soft.east-2")).toBe(true);
  });

  it("bomb-on-bomb chain reaction sets the second bomb's fuse to 0", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5);
    addBomb(world, "bomb.a", 5, 5, { fuse: 1 / 60, range: 2 });
    addBomb(world, "bomb.b", 6, 5, { fuse: 999, range: 2 });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const fuse = createKaboomBombFuseSystem();
    fuse.fixedUpdate!(ctx(world));
    occ.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy: occ });
    blast.fixedUpdate!(ctx(world));
    const bombB = world.getComponent("bomb.b", "Bomb") as { fuseRemaining: number } | undefined;
    expect(bombB?.fuseRemaining).toBe(0);
  });

  it("bomber on a blast tile dies (BomberStats.alive flips false)", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5);
    addBomber(world, "bot.1", 6, 5);
    addBomb(world, "bomb.a", 5, 5, { fuse: 1 / 60, range: 2 });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const fuse = createKaboomBombFuseSystem();
    fuse.fixedUpdate!(ctx(world));
    occ.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy: occ });
    blast.fixedUpdate!(ctx(world));
    const botStats = world.getComponent("bot.1", "BomberStats") as { alive: boolean };
    expect(botStats.alive).toBe(false);
  });

  it("blast tile lifetime ticks down and removes the tile when zero", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5);
    addBomb(world, "bomb.a", 5, 5, { fuse: 1 / 60, range: 1 });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const fuse = createKaboomBombFuseSystem();
    fuse.fixedUpdate!(ctx(world));
    occ.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy: occ });
    blast.fixedUpdate!(ctx(world));
    const lifetime = createKaboomBlastTileLifetimeSystem({ occupancy: occ });
    // Tile lifetime default is 0.4 s; 30 fixed steps * 1/60 = 0.5 s > 0.4 s.
    for (let i = 0; i < 30; i += 1) {
      occ.frameUpdate!(ctx(world));
      lifetime.fixedUpdate!(ctx(world));
    }
    let remainingTiles = 0;
    for (const id of world.entityIds()) {
      if (world.hasComponent(id, "BlastTile")) remainingTiles += 1;
    }
    expect(remainingTiles).toBe(0);
  });
});
