// S109 KABOOM-MULTIPLAYER-FOUNDATION — remote-bomber decorator unit
// tests. Verifies the decorator spawns + tears down the procbomber
// tree based on Presence-tagged entities entering / leaving the world.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomRemoteBomberDecoratorSystem } from "../../src/systems/remote-bomber-decorator-system";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function addRemotePlayer(world: World, rootId: string, playerId: string): void {
  world.addEntity(rootId);
  world.setComponent(rootId, "Presence", { playerId });
  world.setComponent(rootId, "Transform", { position: [1, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1] });
}

function entityCount(world: World): number {
  let n = 0;
  for (const _ of world.entityIds()) {
    void _;
    n += 1;
  }
  return n;
}

describe("createKaboomRemoteBomberDecoratorSystem (S109)", () => {
  it("spawns a bomber tree (>1 entity) for each remote player on first tick", () => {
    const world = new World();
    addRemotePlayer(world, "player.bob", "bob");
    const system = createKaboomRemoteBomberDecoratorSystem({ localPlayerId: "alice" });
    const before = entityCount(world);
    system.fixedUpdate!(ctx(world));
    const after = entityCount(world);
    expect(after).toBeGreaterThan(before);
    // RemoteBomberOwned was stamped on the root.
    expect(world.hasComponent("player.bob", "RemoteBomberOwned")).toBe(true);
    // Bomber root carries LimbPivots after spawn.
    expect(world.hasComponent("player.bob", "LimbPivots")).toBe(true);
  });

  it("skips the local player (no tree spawned for matching playerId)", () => {
    const world = new World();
    addRemotePlayer(world, "player.alice", "alice");
    const before = entityCount(world);
    const system = createKaboomRemoteBomberDecoratorSystem({ localPlayerId: "alice" });
    system.fixedUpdate!(ctx(world));
    expect(entityCount(world)).toBe(before);
    expect(world.hasComponent("player.alice", "RemoteBomberOwned")).toBe(false);
  });

  it("is idempotent — second tick doesn't re-spawn for the same root", () => {
    const world = new World();
    addRemotePlayer(world, "player.bob", "bob");
    const system = createKaboomRemoteBomberDecoratorSystem({ localPlayerId: "alice" });
    system.fixedUpdate!(ctx(world));
    const after1 = entityCount(world);
    system.fixedUpdate!(ctx(world));
    expect(entityCount(world)).toBe(after1);
  });

  it("tears down the tree when the remote player leaves", () => {
    const world = new World();
    addRemotePlayer(world, "player.bob", "bob");
    const system = createKaboomRemoteBomberDecoratorSystem({ localPlayerId: "alice" });
    system.fixedUpdate!(ctx(world));
    const afterSpawn = entityCount(world);
    expect(afterSpawn).toBeGreaterThan(1);
    // Server snapshot omits player.bob this frame → adapter removed it.
    world.removeEntity("player.bob");
    system.fixedUpdate!(ctx(world));
    expect(entityCount(world)).toBe(0);
  });

  it("supports multiple remote players simultaneously (distinct trees)", () => {
    const world = new World();
    addRemotePlayer(world, "player.bob", "bob");
    addRemotePlayer(world, "player.carol", "carol");
    const system = createKaboomRemoteBomberDecoratorSystem({ localPlayerId: "alice" });
    system.fixedUpdate!(ctx(world));
    expect(world.hasComponent("player.bob", "RemoteBomberOwned")).toBe(true);
    expect(world.hasComponent("player.carol", "RemoteBomberOwned")).toBe(true);
    // Each tree has its own torso entity at `<root>.torso`.
    expect(world.hasEntity("player.bob.torso")).toBe(true);
    expect(world.hasEntity("player.carol.torso")).toBe(true);
  });
});
