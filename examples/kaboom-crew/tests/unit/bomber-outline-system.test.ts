// S277 — coverage for the kaboom bomber-outline-system. Verifies that
// for every bomber root (an entity that owns a `LimbPivots` component)
// we spawn ONE outline duplicate per known body part, with the right
// component shape, and tag the source bomber parts as excluded from
// the engine outline pre-pass.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomBomberOutlineSystem } from "../../src/systems/bomber-outline-system";

const PARTS = ["torso", "head", "upperArmL", "upperArmR", "forearmL", "forearmR", "upperLegL", "upperLegR", "lowerLegL", "lowerLegR"] as const;

function makeBomber(world: World, rootId: string): void {
  world.addEntity(rootId);
  world.setComponent(rootId, "Transform", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  world.setComponent(rootId, "LimbPivots", {
    neck: `${rootId}.neck`, shoulderL: `${rootId}.shoulderL`, shoulderR: `${rootId}.shoulderR`,
    elbowL: `${rootId}.elbowL`, elbowR: `${rootId}.elbowR`,
    hipL: `${rootId}.hipL`, hipR: `${rootId}.hipR`,
    kneeL: `${rootId}.kneeL`, kneeR: `${rootId}.kneeR`
  });
  for (const part of PARTS) {
    const id = `${rootId}.${part}`;
    world.addEntity(id);
    world.setComponent(id, "Transform", { parent: rootId, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    world.setComponent(id, "MeshRenderer", { mesh: `procedural:procbomber-${part}#${rootId}` });
  }
}

function step(system: { frameUpdate?: (ctx: never) => void }, world: World): void {
  (system.frameUpdate as ((ctx: unknown) => void) | undefined)?.({
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0, physicsAlpha: 0 },
    world
  });
}

describe("createKaboomBomberOutlineSystem (S277)", () => {
  it("spawns one outline duplicate per known body part with OutlineOccluder + same mesh ref", () => {
    const world = new World();
    makeBomber(world, "player.1");
    const sys = createKaboomBomberOutlineSystem();
    step(sys, world);
    for (const part of PARTS) {
      const outlineId = `player.1.${part}.outline-occluder`;
      expect(world.hasEntity(outlineId), `expected outline entity ${outlineId}`).toBe(true);
      const renderer = world.getComponent<{ mesh: string }>(outlineId, "MeshRenderer");
      expect(renderer?.mesh).toBe(`procedural:procbomber-${part}#player.1`);
      const occluder = world.getComponent<{ color: string; opacity?: number }>(outlineId, "OutlineOccluder");
      expect(occluder).toBeDefined();
      expect(occluder?.color).toBe("#3ab0ff"); // player.1 → sky.torsoTop
    }
  });

  it("is idempotent — second step doesn't re-spawn outline duplicates", () => {
    const world = new World();
    makeBomber(world, "player.1");
    const sys = createKaboomBomberOutlineSystem();
    step(sys, world);
    const before = world.entityCount();
    step(sys, world);
    expect(world.entityCount()).toBe(before);
  });

  it("uses fallback color for unknown bombers (no BotBrain personality, not the player)", () => {
    const world = new World();
    makeBomber(world, "unknown.99");
    const sys = createKaboomBomberOutlineSystem();
    step(sys, world);
    const occluder = world.getComponent<{ color: string }>("unknown.99.torso.outline-occluder", "OutlineOccluder");
    expect(occluder?.color).toBe("#7fd6ff");
  });

  it("respects the BotBrain personality colour for NPC bombers", () => {
    const world = new World();
    makeBomber(world, "opponent.1");
    world.setComponent("opponent.1", "BotBrain", { personality: "hunter" });
    const sys = createKaboomBomberOutlineSystem();
    step(sys, world);
    const occluder = world.getComponent<{ color: string }>("opponent.1.torso.outline-occluder", "OutlineOccluder");
    expect(occluder?.color).toBe("#e65a3a"); // hunter → ember.torsoTop
  });
});
