// S277b — coverage for the kaboom bomb-outline-system. Verifies that
// for every Bomb mesh we spawn ONE `<bombId>.outline-occluder` carrying
// the engine `OutlineOccluder` component, tinted in the placer's
// palette colour (with a fallback for unknown owners).

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomBombOutlineSystem } from "../../src/systems/bomb-outline-system";

function makeBomb(world: World, bombId: string, ownerId: string | undefined): void {
  world.addEntity(bombId);
  world.setComponent(bombId, "Transform", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [0.35, 0.35, 0.35] });
  world.setComponent(bombId, "MeshRenderer", { mesh: "sphere", color: "#1a1a1a" });
  world.setComponent(bombId, "Bomb", { fuseRemaining: 2, range: 2, ...(ownerId !== undefined ? { ownerId } : {}) });
}

function step(system: { frameUpdate?: (ctx: never) => void }, world: World): void {
  (system.frameUpdate as ((ctx: unknown) => void) | undefined)?.({
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0, physicsAlpha: 0 },
    world
  });
}

describe("createKaboomBombOutlineSystem (S277b)", () => {
  it("spawns one outline duplicate per Bomb with matching mesh ref + OutlineOccluder", () => {
    const world = new World();
    makeBomb(world, "player.1.bomb.0", "player.1");
    const sys = createKaboomBombOutlineSystem();
    step(sys, world);
    const outlineId = "player.1.bomb.0.outline-occluder";
    expect(world.hasEntity(outlineId)).toBe(true);
    const renderer = world.getComponent<{ mesh: string }>(outlineId, "MeshRenderer");
    expect(renderer?.mesh).toBe("sphere");
    const occluder = world.getComponent<{ color: string }>(outlineId, "OutlineOccluder");
    expect(occluder?.color).toBe("#3ab0ff"); // player.1 → sky palette
  });

  it("uses placer-personality colour for NPC bombs", () => {
    const world = new World();
    world.addEntity("opp.1");
    world.setComponent("opp.1", "BotBrain", { personality: "miner" });
    makeBomb(world, "opp.1.bomb.0", "opp.1");
    const sys = createKaboomBombOutlineSystem();
    step(sys, world);
    const occluder = world.getComponent<{ color: string }>("opp.1.bomb.0.outline-occluder", "OutlineOccluder");
    expect(occluder?.color).toBe("#c9a14d"); // miner → sand palette
  });

  it("uses the warm-orange fallback when ownerId is missing / unknown", () => {
    const world = new World();
    makeBomb(world, "stale.bomb.0", undefined);
    const sys = createKaboomBombOutlineSystem();
    step(sys, world);
    const occluder = world.getComponent<{ color: string }>("stale.bomb.0.outline-occluder", "OutlineOccluder");
    expect(occluder?.color).toBe("#ff7a3a");
  });

  it("is idempotent — a second step doesn't re-spawn duplicates", () => {
    const world = new World();
    makeBomb(world, "player.1.bomb.0", "player.1");
    const sys = createKaboomBombOutlineSystem();
    step(sys, world);
    const before = world.entityCount();
    step(sys, world);
    expect(world.entityCount()).toBe(before);
  });

  it("recovers when a bomb is removed + a new bomb of the same id placed (round reset)", () => {
    const world = new World();
    makeBomb(world, "player.1.bomb.0", "player.1");
    const sys = createKaboomBombOutlineSystem();
    step(sys, world);
    world.removeEntity("player.1.bomb.0");
    // Outline child remains until the next frame's GC — the engine
    // transform-graph cleanup handles dangling children. The system's
    // own `done` set must drop the id so a fresh bomb with the same id
    // gets a freshly-spawned outline duplicate next frame.
    step(sys, world);
    makeBomb(world, "player.1.bomb.0", "player.1");
    step(sys, world);
    expect(world.hasEntity("player.1.bomb.0.outline-occluder")).toBe(true);
  });
});
