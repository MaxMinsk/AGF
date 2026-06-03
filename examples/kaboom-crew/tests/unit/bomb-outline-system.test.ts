// S277i — coverage for the kaboom bomb-outline-system. Bombs use the
// engine `OutlineOccluder` NodeMaterial path (same as bombers) — the
// engine system handles the WebGPU material swap + visibility gating.

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

describe("createKaboomBombOutlineSystem (S277i)", () => {
  it("spawns one duplicate per Bomb with matching mesh ref + placer-palette OutlineOccluder", () => {
    const world = new World();
    makeBomb(world, "bomb.player.1.1", "player.1");
    const sys = createKaboomBombOutlineSystem();
    step(sys, world);
    const outlineId = "bomb.player.1.1.outline-occluder";
    expect(world.hasEntity(outlineId)).toBe(true);
    const renderer = world.getComponent<{ mesh: string }>(outlineId, "MeshRenderer");
    expect(renderer?.mesh).toBe("sphere");
    const occluder = world.getComponent<{ color: string; softEdge?: number }>(outlineId, "OutlineOccluder");
    expect(occluder?.color).toBe("#3ab0ff");
    expect(occluder?.softEdge).toBe(0.003);
  });

  it("uses placer-personality colour for NPC bombs", () => {
    const world = new World();
    world.addEntity("opp.1");
    world.setComponent("opp.1", "BotBrain", { personality: "miner" });
    makeBomb(world, "bomb.opp.1.1", "opp.1");
    const sys = createKaboomBombOutlineSystem();
    step(sys, world);
    const occluder = world.getComponent<{ color: string }>("bomb.opp.1.1.outline-occluder", "OutlineOccluder");
    expect(occluder?.color).toBe("#c9a14d");
  });

  it("falls back to warm-orange when ownerId is missing / unknown", () => {
    const world = new World();
    makeBomb(world, "stale.bomb.0", undefined);
    const sys = createKaboomBombOutlineSystem();
    step(sys, world);
    const occluder = world.getComponent<{ color: string }>("stale.bomb.0.outline-occluder", "OutlineOccluder");
    expect(occluder?.color).toBe("#ff7a3a");
  });

  it("is idempotent — a second step doesn't re-spawn duplicates", () => {
    const world = new World();
    makeBomb(world, "bomb.player.1.1", "player.1");
    const sys = createKaboomBombOutlineSystem();
    step(sys, world);
    const before = world.entityCount();
    step(sys, world);
    expect(world.entityCount()).toBe(before);
  });

  it("survives a 'map restart' (same bomb-id re-used after detonation)", () => {
    const world = new World();
    makeBomb(world, "bomb.player.1.1", "player.1");
    const sys = createKaboomBombOutlineSystem();
    step(sys, world);
    expect(world.hasEntity("bomb.player.1.1.outline-occluder")).toBe(true);
    world.removeEntity("bomb.player.1.1");
    step(sys, world);
    expect(world.hasEntity("bomb.player.1.1.outline-occluder")).toBe(false);
    makeBomb(world, "bomb.player.1.1", "player.1");
    step(sys, world);
    expect(world.hasEntity("bomb.player.1.1.outline-occluder")).toBe(true);
  });
});
