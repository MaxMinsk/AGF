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
