// S112 KABOOM-MP-RECIPE-SYNC — ServerWorld unit tests.
//
// Covers the recipe-blob plumbing: join carries the opaque recipe,
// the snapshot echoes it as a CharacterRecipe component on the
// player.<id> entity, and re-join overwrites the stored recipe
// (reconnect flow).

import { describe, expect, it } from "vitest";

import { ServerWorld } from "../../examples/backends/node-world-server/src/world";

describe("ServerWorld (S112 KABOOM-MP-RECIPE-SYNC)", () => {
  it("snapshot omits CharacterRecipe when the player joined without a recipe", () => {
    const world = new ServerWorld();
    world.join("alice");
    const snap = world.snapshot();
    const entity = snap.entities.find((e) => e.id === "player.alice")!;
    expect(entity).toBeDefined();
    expect(entity.components["CharacterRecipe"]).toBeUndefined();
    expect((entity.components["Transform"] as { position: number[] }).position).toEqual([0, 0.4, 0]);
  });

  it("snapshot echoes the opaque recipe blob in CharacterRecipe when supplied", () => {
    const world = new ServerWorld();
    world.join("alice", "base64-recipe-blob-here");
    const snap = world.snapshot();
    const entity = snap.entities.find((e) => e.id === "player.alice")!;
    expect((entity.components["CharacterRecipe"] as { recipe: string }).recipe).toBe("base64-recipe-blob-here");
  });

  it("multiple players carry distinct recipes simultaneously", () => {
    const world = new ServerWorld();
    world.join("alice", "alice-recipe");
    world.join("bob", "bob-recipe");
    world.join("carol"); // no recipe
    const snap = world.snapshot();
    const a = snap.entities.find((e) => e.id === "player.alice")!;
    const b = snap.entities.find((e) => e.id === "player.bob")!;
    const c = snap.entities.find((e) => e.id === "player.carol")!;
    expect((a.components["CharacterRecipe"] as { recipe: string }).recipe).toBe("alice-recipe");
    expect((b.components["CharacterRecipe"] as { recipe: string }).recipe).toBe("bob-recipe");
    expect(c.components["CharacterRecipe"]).toBeUndefined();
  });

  it("re-join with a different recipe overwrites the stored one (reconnect flow)", () => {
    const world = new ServerWorld();
    world.join("alice", "v1-recipe");
    world.join("alice", "v2-recipe");
    const snap = world.snapshot();
    const entity = snap.entities.find((e) => e.id === "player.alice")!;
    expect((entity.components["CharacterRecipe"] as { recipe: string }).recipe).toBe("v2-recipe");
  });

  it("re-join WITHOUT a recipe keeps the previously stored one (idempotent join)", () => {
    const world = new ServerWorld();
    world.join("alice", "v1-recipe");
    world.join("alice"); // no recipe — should not blow away v1
    const snap = world.snapshot();
    const entity = snap.entities.find((e) => e.id === "player.alice")!;
    expect((entity.components["CharacterRecipe"] as { recipe: string }).recipe).toBe("v1-recipe");
  });
});

// S117 KABOOM-MP-SPRINT-B — server-authoritative bomb placement.

describe("ServerWorld.placeBomb (S117)", () => {
  it("spawns a Bomb entity that appears in the next snapshot", () => {
    const world = new ServerWorld();
    world.join("alice");
    const bombId = world.placeBomb("alice", 3, 4);
    expect(bombId).toBeDefined();
    const snap = world.snapshot();
    const bomb = snap.entities.find((e) => e.id === bombId);
    expect(bomb).toBeDefined();
    expect(bomb!.components["Bomb"]).toMatchObject({ fuseRemaining: 2.5, range: 2, ownerId: "player.alice" });
    expect(bomb!.components["GridPosition"]).toEqual({ gx: 3, gz: 4 });
  });

  it("returns undefined for an unknown player", () => {
    const world = new ServerWorld();
    expect(world.placeBomb("alice", 3, 4)).toBeUndefined();
  });

  it("refuses to stack a second bomb on the same cell (any player)", () => {
    const world = new ServerWorld();
    world.join("alice");
    world.join("bob");
    expect(world.placeBomb("alice", 3, 4)).toBeDefined();
    expect(world.placeBomb("alice", 3, 4)).toBeUndefined();
    expect(world.placeBomb("bob", 3, 4)).toBeUndefined();
    expect(world.placeBomb("bob", 5, 4)).toBeDefined();
  });

  it("multiple bombs from the same player get distinct ids", () => {
    const world = new ServerWorld();
    world.join("alice");
    const a = world.placeBomb("alice", 1, 1);
    const b = world.placeBomb("alice", 2, 2);
    const c = world.placeBomb("alice", 3, 3);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    const snap = world.snapshot();
    const bombs = snap.entities.filter((e) => e.id.startsWith("bomb."));
    expect(bombs.length).toBe(3);
  });
});

// S117 KABOOM-MP-SPRINT-B chunk 3 — server-authoritative fuse tick.

describe("ServerWorld.tick — bomb fuse (S117)", () => {
  it("decrements Bomb.fuseRemaining each tick", () => {
    const world = new ServerWorld();
    world.join("alice");
    const bombId = world.placeBomb("alice", 3, 4)!;
    world.tick(1.0);
    const snap = world.snapshot();
    const bomb = snap.entities.find((e) => e.id === bombId)!;
    expect((bomb.components["Bomb"] as { fuseRemaining: number }).fuseRemaining).toBeCloseTo(1.5, 5);
  });

  it("detonates when fuse hits zero — removes bomb + emits blastEvent", () => {
    const world = new ServerWorld();
    world.join("alice");
    const bombId = world.placeBomb("alice", 3, 4)!;
    // 3 s > 2.5 s default fuse → detonate this tick.
    world.tick(3.0);
    const snap = world.snapshot();
    expect(snap.entities.find((e) => e.id === bombId)).toBeUndefined();
    const events = world.drainBlastEvents();
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({
      originGx: 3,
      originGz: 4,
      range: 2,
      ownerId: "player.alice",
      bombId
    });
  });

  it("drainBlastEvents clears the queue", () => {
    const world = new ServerWorld();
    world.join("alice");
    world.placeBomb("alice", 1, 1);
    world.tick(3.0);
    expect(world.drainBlastEvents().length).toBe(1);
    expect(world.drainBlastEvents().length).toBe(0);
  });

  it("multiple bombs detonate together in the same tick", () => {
    const world = new ServerWorld();
    world.join("alice");
    world.placeBomb("alice", 1, 1);
    world.placeBomb("alice", 2, 2);
    world.placeBomb("alice", 3, 3);
    world.tick(3.0);
    const events = world.drainBlastEvents();
    expect(events.length).toBe(3);
    // Each blast carries its bomb's origin cell.
    const cells = events.map((e) => `${e.originGx},${e.originGz}`).sort();
    expect(cells).toEqual(["1,1", "2,2", "3,3"]);
  });

  it("bomb survives a partial tick (dt < fuseRemaining)", () => {
    const world = new ServerWorld();
    world.join("alice");
    const bombId = world.placeBomb("alice", 3, 4)!;
    world.tick(0.1);
    world.tick(0.1);
    world.tick(0.1);
    const snap = world.snapshot();
    expect(snap.entities.find((e) => e.id === bombId)).toBeDefined();
    expect(world.drainBlastEvents().length).toBe(0);
  });

  it("after detonation, the cell is free to receive a new bomb", () => {
    const world = new ServerWorld();
    world.join("alice");
    world.placeBomb("alice", 3, 4);
    world.tick(3.0);
    world.drainBlastEvents();
    // No-stack guard should now allow a new bomb on (3, 4).
    expect(world.placeBomb("alice", 3, 4)).toBeDefined();
  });
});
