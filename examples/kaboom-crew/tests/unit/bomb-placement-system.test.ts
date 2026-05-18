// S82 KABOOM-BOMB-PLACE unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { createKaboomBombPlacementSystem } from "../../src/systems/bomb-placement-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function makePlayer(world: World, id: string, gx: number, gz: number, opts: { maxBombs?: number; activeBombs?: number; range?: number; alive?: boolean } = {}): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "BomberStats", {
    maxBombs: opts.maxBombs ?? 1,
    range: opts.range ?? 2,
    activeBombs: opts.activeBombs ?? 0,
    alive: opts.alive ?? true
  });
  world.setComponent(id, "PlaceBombRequest", {});
}

describe("createKaboomBombPlacementSystem (S82 KABOOM-BOMB-PLACE)", () => {
  it("spawns a Bomb entity on the requester's cell + increments activeBombs", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4);
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.test" });
    system.frameUpdate!(ctx(world));
    expect(world.hasEntity("bomb.test")).toBe(true);
    const bomb = world.getComponent("bomb.test", "Bomb") as { fuseRemaining: number; range: number; ownerId: string };
    expect(bomb.range).toBe(2);
    expect(bomb.ownerId).toBe("player.1");
    const stats = world.getComponent("player.1", "BomberStats") as { activeBombs: number };
    expect(stats.activeBombs).toBe(1);
    expect(world.hasComponent("player.1", "PlaceBombRequest")).toBe(false);
  });

  it("refuses when activeBombs already hits maxBombs", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4, { maxBombs: 1, activeBombs: 1 });
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy });
    system.frameUpdate!(ctx(world));
    // No bomb entity created — the only entity is the player.
    let bombs = 0;
    for (const id of world.entityIds()) {
      if (world.hasComponent(id, "Bomb")) bombs += 1;
    }
    expect(bombs).toBe(0);
    // Request is still consumed even on refusal.
    expect(world.hasComponent("player.1", "PlaceBombRequest")).toBe(false);
  });

  it("refuses when a bomb already occupies the cell (no stacking)", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4);
    // Pre-existing bomb on (3,4).
    world.addEntity("bomb.existing");
    world.setComponent("bomb.existing", "GridPosition", { gx: 3, gz: 4 });
    world.setComponent("bomb.existing", "GridOccupant", { layer: "bomb" });
    world.setComponent("bomb.existing", "Bomb", { fuseRemaining: 2, range: 2, ownerId: "player.1" });
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.new" });
    system.frameUpdate!(ctx(world));
    expect(world.hasEntity("bomb.new")).toBe(false);
  });

  it("refuses when the bomber is no longer alive", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4, { alive: false });
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.dead" });
    system.frameUpdate!(ctx(world));
    expect(world.hasEntity("bomb.dead")).toBe(false);
  });

  it("two bombers on different cells each get their own bomb", () => {
    const world = new World();
    makePlayer(world, "player.1", 1, 1);
    makePlayer(world, "bot.1", 9, 5);
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    let n = 0;
    const system = createKaboomBombPlacementSystem({
      occupancy,
      nextBombId: () => `bomb.${++n}`
    });
    system.frameUpdate!(ctx(world));
    expect(world.hasEntity("bomb.1")).toBe(true);
    expect(world.hasEntity("bomb.2")).toBe(true);
  });
});
