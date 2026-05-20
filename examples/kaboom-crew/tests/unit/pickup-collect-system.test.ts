// S82 KABOOM-PICKUPS-AND-STATS — PickupCollectSystem unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomPickupCollectSystem } from "../../src/systems/pickup-collect-system";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

// Minimal occupancy stub keyed by `${gx},${gz}`.
function makeOccupancy(occupants: ReadonlyMap<string, ReadonlyArray<string>>) {
  return {
    occupants: (gx: number, gz: number) => occupants.get(`${gx},${gz}`) ?? [],
    blocked: () => false,
    occupiedCells: () => []
  };
}

function addBomber(
  world: World,
  id: string,
  gx: number,
  gz: number,
  stats: { maxBombs?: number; range?: number; speed?: number } = {}
): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridMover", { speed: stats.speed ?? 4 });
  world.setComponent(id, "BomberStats", {
    maxBombs: stats.maxBombs ?? 1,
    range: stats.range ?? 2,
    speed: stats.speed,
    alive: true
  });
}

function addPickup(world: World, id: string, gx: number, gz: number, kind: "bomb-up" | "fire-up" | "speed-up"): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Pickup", { kind });
}

describe("createKaboomPickupCollectSystem (S82 KABOOM-PICKUPS-AND-STATS)", () => {
  it("bomb-up increments BomberStats.maxBombs by 1", () => {
    const world = new World();
    addBomber(world, "player.1", 4, 6, { maxBombs: 1 });
    addPickup(world, "pickup.1", 4, 6, "bomb-up");
    const occupancy = makeOccupancy(new Map([["4,6", ["player.1", "pickup.1"]]]));
    const system = createKaboomPickupCollectSystem({ occupancy });
    system.fixedUpdate!(ctx(world));
    const stats = world.getComponent<{ maxBombs: number }>("player.1", "BomberStats");
    expect(stats?.maxBombs).toBe(2);
    expect(world.hasEntity("pickup.1")).toBe(false);
  });

  it("fire-up increments BomberStats.range by 1", () => {
    const world = new World();
    addBomber(world, "player.1", 0, 0, { range: 2 });
    addPickup(world, "pickup.1", 0, 0, "fire-up");
    const occupancy = makeOccupancy(new Map([["0,0", ["player.1", "pickup.1"]]]));
    const system = createKaboomPickupCollectSystem({ occupancy });
    system.fixedUpdate!(ctx(world));
    const stats = world.getComponent<{ range: number }>("player.1", "BomberStats");
    expect(stats?.range).toBe(3);
    expect(world.hasEntity("pickup.1")).toBe(false);
  });

  it("speed-up increments GridMover.speed AND mirrors into BomberStats.speed", () => {
    const world = new World();
    addBomber(world, "player.1", 1, 1, { speed: 4 });
    addPickup(world, "pickup.1", 1, 1, "speed-up");
    const occupancy = makeOccupancy(new Map([["1,1", ["player.1", "pickup.1"]]]));
    const system = createKaboomPickupCollectSystem({ occupancy, speedStep: 1 });
    system.fixedUpdate!(ctx(world));
    const mover = world.getComponent<{ speed: number }>("player.1", "GridMover");
    const stats = world.getComponent<{ speed?: number }>("player.1", "BomberStats");
    expect(mover?.speed).toBe(5);
    expect(stats?.speed).toBe(5);
    expect(world.hasEntity("pickup.1")).toBe(false);
  });

  it("does NOT exceed the configured caps", () => {
    const world = new World();
    addBomber(world, "player.1", 2, 2, { maxBombs: 8 });
    addPickup(world, "pickup.1", 2, 2, "bomb-up");
    const occupancy = makeOccupancy(new Map([["2,2", ["player.1", "pickup.1"]]]));
    const system = createKaboomPickupCollectSystem({ occupancy, maxBombsCap: 8 });
    system.fixedUpdate!(ctx(world));
    const stats = world.getComponent<{ maxBombs: number }>("player.1", "BomberStats");
    expect(stats?.maxBombs).toBe(8); // capped
    expect(world.hasEntity("pickup.1")).toBe(false); // still consumed
  });

  it("does NOT apply to a dead bomber on the same cell", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, { maxBombs: 1 });
    world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: false });
    addPickup(world, "pickup.1", 5, 5, "bomb-up");
    const occupancy = makeOccupancy(new Map([["5,5", ["player.1", "pickup.1"]]]));
    const system = createKaboomPickupCollectSystem({ occupancy });
    system.fixedUpdate!(ctx(world));
    const stats = world.getComponent<{ maxBombs: number }>("player.1", "BomberStats");
    expect(stats?.maxBombs).toBe(1); // unchanged
    expect(world.hasEntity("pickup.1")).toBe(true); // still on the floor
  });

  it("S096 KABOOM-PICKUP-COLLECT-PARTICLE: collect spawns a fx entity with a 'spark' ParticleEmitter at the cell", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, { maxBombs: 1 });
    addPickup(world, "pickup.1", 5, 5, "bomb-up");
    const occupancy = makeOccupancy(new Map([["5,5", ["player.1", "pickup.1"]]]));
    const system = createKaboomPickupCollectSystem({ occupancy });
    system.fixedUpdate!(ctx(world));
    // Original pickup removed.
    expect(world.hasEntity("pickup.1")).toBe(false);
    // fx entity exists with a spark emitter at the cell.
    const fxId = "pickup.1.collect-fx";
    expect(world.hasEntity(fxId)).toBe(true);
    const transform = world.getComponent(fxId, "Transform") as { position: ReadonlyArray<number> };
    expect(transform.position[0]).toBe(5);
    expect(transform.position[2]).toBe(5);
    const emitter = world.getComponent(fxId, "ParticleEmitter") as
      | { preset: string; lifetime?: number; rate?: number }
      | undefined;
    expect(emitter).toBeDefined();
    expect(emitter!.preset).toBe("spark");
    expect(emitter!.lifetime).toBeGreaterThan(0);
    expect(emitter!.rate).toBeGreaterThan(0);
  });

  it("leaves the pickup alone when no bomber shares the cell", () => {
    const world = new World();
    addPickup(world, "pickup.1", 3, 3, "fire-up");
    const occupancy = makeOccupancy(new Map([["3,3", ["pickup.1"]]]));
    const system = createKaboomPickupCollectSystem({ occupancy });
    system.fixedUpdate!(ctx(world));
    expect(world.hasEntity("pickup.1")).toBe(true);
  });
});
