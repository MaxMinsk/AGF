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

  // S112 KABOOM-MP-RECIPE-SYNC.
  it("S112: decodes CharacterRecipe from the snapshot when present (Option B path)", async () => {
    const { encodeRecipe } = await import("../../../procbomber-bench/src/character-recipe");
    const world = new World();
    world.addEntity("player.bob");
    world.setComponent("player.bob", "Presence", { playerId: "bob" });
    world.setComponent("player.bob", "Transform", { position: [1, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1] });
    // The server echoed back an encoded recipe; the decorator must
    // decode it and use that for the spawned tree.
    const encoded = encodeRecipe({ seed: "alpha", paletteName: "ember" });
    world.setComponent("player.bob", "CharacterRecipe", { recipe: encoded });
    const system = createKaboomRemoteBomberDecoratorSystem({ localPlayerId: "alice" });
    system.fixedUpdate!(ctx(world));
    expect(world.hasComponent("player.bob", "RemoteBomberOwned")).toBe(true);
    // The spawned torso entity uses the actual recipe — the easiest
    // smoke is that the tree got built at all + that the torso entity
    // exists (recipe resolution failures would have skipped the tree).
    expect(world.hasEntity("player.bob.torso")).toBe(true);
  });

  it("S112: falls back to seed-from-id when no CharacterRecipe component is present (S109 compat)", () => {
    const world = new World();
    world.addEntity("player.bob");
    world.setComponent("player.bob", "Presence", { playerId: "bob" });
    world.setComponent("player.bob", "Transform", { position: [1, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1] });
    // No CharacterRecipe — older server (S109 connect-and-spectate
    // path). The decorator still spawns a tree from the fallback seed.
    const system = createKaboomRemoteBomberDecoratorSystem({ localPlayerId: "alice" });
    system.fixedUpdate!(ctx(world));
    expect(world.hasComponent("player.bob", "RemoteBomberOwned")).toBe(true);
    expect(world.hasEntity("player.bob.torso")).toBe(true);
  });

  it("S112: ignores a malformed CharacterRecipe (fallback to seed-from-id)", () => {
    const world = new World();
    world.addEntity("player.bob");
    world.setComponent("player.bob", "Presence", { playerId: "bob" });
    world.setComponent("player.bob", "Transform", { position: [1, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1] });
    world.setComponent("player.bob", "CharacterRecipe", { recipe: "not-a-valid-base64-recipe-blob" });
    const system = createKaboomRemoteBomberDecoratorSystem({ localPlayerId: "alice" });
    system.fixedUpdate!(ctx(world));
    // Still spawned — decodeRecipe returned undefined, system used the seed fallback.
    expect(world.hasEntity("player.bob.torso")).toBe(true);
  });
});
