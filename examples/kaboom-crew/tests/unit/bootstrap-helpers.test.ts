// S139 — regression tests for the idempotent upsert helper.
//
// The HMR replay path used to throw "Entity 'kaboom.game-state' already
// exists" because attachUi re-ran on the second hot-reload. The helper
// emits entity.create on the first pass and component.set on every
// subsequent pass, so attachUi can run any number of times.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { upsertEntityCommands } from "../../src/bootstrap-helpers";

describe("upsertEntityCommands (S139)", () => {
  it("emits entity.create on the first pass when the entity does NOT exist", () => {
    const world = new World();
    const cmds = upsertEntityCommands(world, "kaboom.game-state", {
      GamePaused: { reason: "title-screen" },
      MatchState: { phase: "playing", target: 3, matchNumber: 1 }
    });
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({
      kind: "entity.create",
      entityId: "kaboom.game-state",
      components: {
        GamePaused: { reason: "title-screen" },
        MatchState: { phase: "playing", target: 3, matchNumber: 1 }
      }
    });
  });

  it("emits component.set per component on subsequent passes when the entity exists", () => {
    const world = new World();
    // Simulate first pass having created the entity.
    world.addEntity("kaboom.game-state");
    world.setComponent("kaboom.game-state", "GamePaused", { reason: "round-1" });
    world.setComponent("kaboom.game-state", "MatchState", { phase: "playing", target: 3, matchNumber: 5 });

    const cmds = upsertEntityCommands(world, "kaboom.game-state", {
      GamePaused: { reason: "title-screen" },
      MatchState: { phase: "playing", target: 3, matchNumber: 1 }
    });
    expect(cmds).toHaveLength(2);
    // Both commands target the existing entity via component.set; no
    // entity.create in the output.
    expect(cmds.every((c) => (c as { kind: string }).kind === "component.set")).toBe(true);
    expect(cmds.some((c) => (c as { component?: string }).component === "GamePaused")).toBe(true);
    expect(cmds.some((c) => (c as { component?: string }).component === "MatchState")).toBe(true);
  });

  it("the second-pass component.set commands carry the FRESH values, not the stale ones", () => {
    const world = new World();
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", {
      phase: "resolved",
      elapsed: 90,
      roundNumber: 7
    });
    const cmds = upsertEntityCommands(world, "kaboom.round-state", {
      RoundState: { phase: "playing", elapsed: 0, roundNumber: 1 }
    });
    expect(cmds).toHaveLength(1);
    expect((cmds[0] as { data?: unknown }).data).toMatchObject({
      phase: "playing",
      elapsed: 0,
      roundNumber: 1
    });
  });

  it("running both passes against the same world produces a usable result both times", () => {
    // Test that the helper's contract holds end-to-end: emit commands
    // from pass 1, apply them, then emit + apply pass 2. No errors.
    const world = new World();
    const apply = (cmds: ReturnType<typeof upsertEntityCommands>): void => {
      for (const cmd of cmds) {
        const c = cmd as { kind: string; entityId: string; components?: Record<string, unknown>; component?: string; data?: unknown };
        if (c.kind === "entity.create") {
          world.addEntity(c.entityId);
          if (c.components !== undefined) {
            for (const [comp, data] of Object.entries(c.components)) {
              world.setComponent(c.entityId, comp, data);
            }
          }
        } else if (c.kind === "component.set") {
          world.setComponent(c.entityId, c.component!, c.data);
        }
      }
    };
    // Pass 1: creates the entity.
    apply(upsertEntityCommands(world, "kaboom.game-state", {
      MatchState: { phase: "playing", target: 3, matchNumber: 1 }
    }));
    expect(world.hasEntity("kaboom.game-state")).toBe(true);
    const first = world.getComponent<{ matchNumber: number }>("kaboom.game-state", "MatchState")!;
    expect(first.matchNumber).toBe(1);
    // Pass 2: must NOT throw, must overwrite the matchNumber.
    apply(upsertEntityCommands(world, "kaboom.game-state", {
      MatchState: { phase: "playing", target: 3, matchNumber: 2 }
    }));
    const second = world.getComponent<{ matchNumber: number }>("kaboom.game-state", "MatchState")!;
    expect(second.matchNumber).toBe(2);
  });
});
