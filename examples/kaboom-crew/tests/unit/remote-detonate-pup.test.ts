// S100 KABOOM-REMOTE-DETONATE-PUP — power-up + paused-fuse mechanic.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomBombPlacementSystem } from "../../src/systems/bomb-placement-system";
import { createKaboomBombFuseSystem } from "../../src/systems/bomb-fuse-system";
import { createKaboomPickupCollectSystem } from "../../src/systems/pickup-collect-system";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function makePlayer(world: World, id: string, gx: number, gz: number, opts: { charges?: number; maxBombs?: number } = {}) {
  world.addEntity(id);
  world.setComponent(id, "PlayerControlled", { speed: 4 });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "BomberStats", {
    maxBombs: opts.maxBombs ?? 3,
    range: 2,
    alive: true,
    activeBombs: 0,
    remoteDetonateCharges: opts.charges ?? 0
  });
  world.setComponent(id, "GridMover", { speed: 4 });
}

function emitPlace(world: World, entityId: string) {
  world.setComponent(entityId, "PlaceBombRequest", {});
}

function makeOccupancy(world: World) {
  return {
    occupants: (gx: number, gz: number, layer?: string): ReadonlyArray<string> => {
      const out: string[] = [];
      for (const id of world.createQuery(["GridPosition", "GridOccupant"]).run()) {
        const pos = world.getComponent<{ gx: number; gz: number }>(id, "GridPosition");
        const occ = world.getComponent<{ layer?: string }>(id, "GridOccupant");
        if (pos?.gx !== gx || pos?.gz !== gz) continue;
        if (layer !== undefined && occ?.layer !== layer) continue;
        out.push(id);
      }
      return out;
    },
    blocked: () => false,
    occupiedCells: () => []
  };
}

describe("KABOOM-REMOTE-DETONATE-PUP collect (S100)", () => {
  it("collecting a remote-detonate pickup increments BomberStats.remoteDetonateCharges", () => {
    const world = new World();
    makePlayer(world, "player.1", 4, 6);
    world.addEntity("pickup.1");
    world.setComponent("pickup.1", "GridPosition", { gx: 4, gz: 6 });
    world.setComponent("pickup.1", "Pickup", { kind: "remote-detonate" });
    const occupancy = {
      occupants: (gx: number, gz: number): ReadonlyArray<string> => (gx === 4 && gz === 6 ? ["player.1", "pickup.1"] : []),
      blocked: () => false,
      occupiedCells: () => []
    };
    const system = createKaboomPickupCollectSystem({ occupancy });
    system.fixedUpdate!(ctx(world));
    const stats = world.getComponent("player.1", "BomberStats") as { remoteDetonateCharges?: number };
    expect(stats.remoteDetonateCharges).toBe(1);
  });

  it("charges cap at 3 — collecting a 4th remote-detonate has no effect", () => {
    const world = new World();
    makePlayer(world, "player.1", 4, 6, { charges: 3 });
    world.addEntity("pickup.1");
    world.setComponent("pickup.1", "GridPosition", { gx: 4, gz: 6 });
    world.setComponent("pickup.1", "Pickup", { kind: "remote-detonate" });
    const occupancy = {
      occupants: (gx: number, gz: number): ReadonlyArray<string> => (gx === 4 && gz === 6 ? ["player.1", "pickup.1"] : []),
      blocked: () => false,
      occupiedCells: () => []
    };
    const system = createKaboomPickupCollectSystem({ occupancy });
    system.fixedUpdate!(ctx(world));
    const stats = world.getComponent("player.1", "BomberStats") as { remoteDetonateCharges?: number };
    expect(stats.remoteDetonateCharges).toBe(3);
  });
});

describe("KABOOM-REMOTE-DETONATE-PUP place (S100)", () => {
  it("placing a bomb with charges > 0 spawns it paused (fuseRemaining = Infinity) and decrements charges", () => {
    const world = new World();
    makePlayer(world, "player.1", 4, 6, { charges: 2 });
    emitPlace(world, "player.1");
    const occupancy = makeOccupancy(world);
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.test" });
    system.frameUpdate!(ctx(world));
    const bomb = world.getComponent("bomb.test", "Bomb") as { fuseRemaining: number };
    expect(bomb.fuseRemaining).toBe(Number.POSITIVE_INFINITY);
    const stats = world.getComponent("player.1", "BomberStats") as { remoteDetonateCharges?: number };
    expect(stats.remoteDetonateCharges).toBe(1);
  });

  it("placing a bomb with charges = 0 spawns a normal-fuse bomb", () => {
    const world = new World();
    makePlayer(world, "player.1", 4, 6, { charges: 0 });
    emitPlace(world, "player.1");
    const occupancy = makeOccupancy(world);
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.test" });
    system.frameUpdate!(ctx(world));
    const bomb = world.getComponent("bomb.test", "Bomb") as { fuseRemaining: number };
    expect(Number.isFinite(bomb.fuseRemaining)).toBe(true);
    expect(bomb.fuseRemaining).toBeGreaterThan(0);
  });
});

describe("KABOOM-REMOTE-DETONATE-PUP fuse trigger (S100)", () => {
  it("RemoteDetonateRequest on a player drops fuseRemaining to 0 on every paused bomb they own", () => {
    const world = new World();
    makePlayer(world, "player.1", 4, 6);
    // Place 3 paused bombs owned by player.1, and one paused bomb owned by bot.1.
    for (let i = 0; i < 3; i += 1) {
      const id = `bomb.p${i}`;
      world.addEntity(id);
      world.setComponent(id, "GridPosition", { gx: i, gz: 0 });
      world.setComponent(id, "Bomb", { fuseRemaining: Number.POSITIVE_INFINITY, range: 2, ownerId: "player.1" });
    }
    world.addEntity("bomb.bot");
    world.setComponent("bomb.bot", "GridPosition", { gx: 9, gz: 9 });
    world.setComponent("bomb.bot", "Bomb", { fuseRemaining: Number.POSITIVE_INFINITY, range: 2, ownerId: "bot.1" });
    world.setComponent("player.1", "RemoteDetonateRequest", {});
    const system = createKaboomBombFuseSystem();
    system.fixedUpdate!(ctx(world));
    // Each triggered bomb detonated this same fixedUpdate (the fuse
    // dropped to 0 in the trigger pass + the detonation branch removed
    // the entity + spawned a BlastEvent), so the player's bombs are
    // gone from the world.
    for (let i = 0; i < 3; i += 1) {
      expect(world.hasEntity(`bomb.p${i}`)).toBe(false);
    }
    // bot.1's paused bomb is untouched (still Infinity, still alive).
    const bot = world.getComponent("bomb.bot", "Bomb") as { fuseRemaining: number };
    expect(bot.fuseRemaining).toBe(Number.POSITIVE_INFINITY);
    // Request is consumed.
    expect(world.hasComponent("player.1", "RemoteDetonateRequest")).toBe(false);
  });

  it("paused bombs don't tick down on their own — fuseRemaining stays Infinity without a trigger", () => {
    const world = new World();
    world.addEntity("bomb.paused");
    world.setComponent("bomb.paused", "GridPosition", { gx: 0, gz: 0 });
    world.setComponent("bomb.paused", "Bomb", { fuseRemaining: Number.POSITIVE_INFINITY, range: 2, ownerId: "player.1" });
    const system = createKaboomBombFuseSystem();
    for (let i = 0; i < 10; i += 1) system.fixedUpdate!(ctx(world));
    const bomb = world.getComponent("bomb.paused", "Bomb") as { fuseRemaining: number };
    expect(bomb.fuseRemaining).toBe(Number.POSITIVE_INFINITY);
  });
});
