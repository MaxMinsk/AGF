// S277d — coverage for the kaboom bomber-outline-system. Each bomber
// root (entity with `LimbPivots`) spawns 10 outline-duplicate children
// driven by the S273 `depthFunc='greater'` MeshRenderer-patch path
// (NOT the WebGPU NodeMaterial). Idempotent + survives map restart.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomBomberOutlineSystem } from "../../src/systems/bomber-outline-system";

const PARTS = [
  "torso", "head", "upperArmL", "upperArmR", "forearmL", "forearmR",
  "upperLegL", "upperLegR", "lowerLegL", "lowerLegR"
] as const;

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

type OutlineMeshRenderer = {
  mesh: string;
  color: string;
  transparent: boolean;
  opacity: number;
  depthFunc: string;
  depthWrite: boolean;
};

describe("createKaboomBomberOutlineSystem (S277d)", () => {
  it("spawns one duplicate per body part with depthFunc='greater' + palette colour", () => {
    const world = new World();
    makeBomber(world, "player.1");
    const sys = createKaboomBomberOutlineSystem();
    step(sys, world);
    for (const part of PARTS) {
      const outlineId = `player.1.${part}.outline-occluder`;
      expect(world.hasEntity(outlineId), `expected outline ${outlineId}`).toBe(true);
      const renderer = world.getComponent<OutlineMeshRenderer>(outlineId, "MeshRenderer");
      expect(renderer).toMatchObject({
        mesh: `procedural:procbomber-${part}#player.1`,
        color: "#3ab0ff",
        transparent: true,
        depthFunc: "greater",
        depthWrite: false
      });
    }
  });

  it("uses BotBrain personality colour for NPC bombers", () => {
    const world = new World();
    makeBomber(world, "opponent.1");
    world.setComponent("opponent.1", "BotBrain", { personality: "hunter" });
    const sys = createKaboomBomberOutlineSystem();
    step(sys, world);
    const renderer = world.getComponent<OutlineMeshRenderer>(
      "opponent.1.torso.outline-occluder",
      "MeshRenderer"
    );
    expect(renderer?.color).toBe("#e65a3a");
  });

  it("is idempotent — second step doesn't re-spawn duplicates", () => {
    const world = new World();
    makeBomber(world, "player.1");
    const sys = createKaboomBomberOutlineSystem();
    step(sys, world);
    const before = world.entityCount();
    step(sys, world);
    expect(world.entityCount()).toBe(before);
  });

  it("survives a map restart: bomber id re-used after death + respawn keeps showing outlines", () => {
    const world = new World();
    makeBomber(world, "player.1");
    const sys = createKaboomBomberOutlineSystem();
    step(sys, world);
    expect(world.hasEntity("player.1.torso.outline-occluder")).toBe(true);
    // map restart: tear the bomber down
    world.removeEntity("player.1");
    for (const part of PARTS) world.removeEntity(`player.1.${part}`);
    step(sys, world); // GC orphans
    expect(world.hasEntity("player.1.torso.outline-occluder")).toBe(false);
    // respawn the bomber with the same id
    makeBomber(world, "player.1");
    step(sys, world);
    expect(world.hasEntity("player.1.torso.outline-occluder")).toBe(true);
    const renderer = world.getComponent<OutlineMeshRenderer>(
      "player.1.torso.outline-occluder",
      "MeshRenderer"
    );
    expect(renderer?.depthFunc).toBe("greater");
  });

  it("falls back to a sky-leaning colour for unknown bomber ids", () => {
    const world = new World();
    makeBomber(world, "unknown.42");
    const sys = createKaboomBomberOutlineSystem();
    step(sys, world);
    const renderer = world.getComponent<OutlineMeshRenderer>(
      "unknown.42.torso.outline-occluder",
      "MeshRenderer"
    );
    expect(renderer?.color).toBe("#7fd6ff");
  });
});
