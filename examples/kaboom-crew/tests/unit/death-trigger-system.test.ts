// S132 KABOOM-DEATH-TRIGGER unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomDeathTriggerSystem } from "../../src/systems/death-trigger-system";

function ctx(world: World, fixedDt = 1 / 60, elapsed = 0) {
  return {
    world,
    time: { elapsed, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

const MESH_SUFFIXES = [
  "torso",
  "head",
  "upperArmL",
  "forearmL",
  "upperArmR",
  "forearmR",
  "upperLegL",
  "lowerLegL",
  "upperLegR",
  "lowerLegR"
];

function addBomberWithMeshes(world: World, rootId: string, opts: { gx?: number; gz?: number } = {}): void {
  world.addEntity(rootId);
  world.setComponent(rootId, "Transform", { position: [opts.gx ?? 5, 0, opts.gz ?? 5] });
  world.setComponent(rootId, "BomberStats", { alive: true });
  // Spawn 10 mesh entities, each parented to the root (simplification —
  // real tree has intermediate pivots, but the trigger only cares about
  // the leaf mesh entity ids + their parent presence).
  for (const suffix of MESH_SUFFIXES) {
    const id = `${rootId}.${suffix}`;
    world.addEntity(id);
    world.setComponent(id, "Transform", { position: [0, 0, 0], parent: rootId });
  }
}

describe("createKaboomDeathTriggerSystem (S132)", () => {
  it("fires a single RagdollSpawnRequest with 10-entry meshMap on the alive→false edge", () => {
    const world = new World();
    addBomberWithMeshes(world, "bot.1");
    const sys = createKaboomDeathTriggerSystem();
    sys.fixedUpdate!(ctx(world)); // baseline — bomber alive
    expect(world.hasComponent("bot.1", "RagdollSpawnRequest")).toBe(false);
    world.setComponent("bot.1", "BomberStats", { alive: false });
    sys.fixedUpdate!(ctx(world));
    expect(world.hasComponent("bot.1", "RagdollSpawnRequest")).toBe(true);
    const req = world.getComponent<{
      templateKey: string;
      meshMap: Record<string, string>;
      impulse: number[];
    }>("bot.1", "RagdollSpawnRequest")!;
    expect(req.templateKey).toBe("kaboom-bomber");
    expect(Object.keys(req.meshMap).length).toBe(10);
    expect(req.meshMap["torso"]).toBe("bot.1.torso");
    expect(req.meshMap["upperArm.l"]).toBe("bot.1.upperArmL");
    expect(req.meshMap["lowerLeg.r"]).toBe("bot.1.lowerLegR");
  });

  it("does not fire when alive stays true", () => {
    const world = new World();
    addBomberWithMeshes(world, "bot.2");
    const sys = createKaboomDeathTriggerSystem();
    sys.fixedUpdate!(ctx(world));
    sys.fixedUpdate!(ctx(world));
    expect(world.hasComponent("bot.2", "RagdollSpawnRequest")).toBe(false);
  });

  it("does not re-fire on subsequent ticks for an already-dead bomber (edge detection)", () => {
    const world = new World();
    addBomberWithMeshes(world, "bot.3");
    const sys = createKaboomDeathTriggerSystem();
    sys.fixedUpdate!(ctx(world));
    world.setComponent("bot.3", "BomberStats", { alive: false });
    sys.fixedUpdate!(ctx(world));
    // Engine spawn-system would normally strip RagdollSpawnRequest;
    // simulate that here so we can re-detect any spurious fire.
    world.removeComponent("bot.3", "RagdollSpawnRequest");
    sys.fixedUpdate!(ctx(world));
    sys.fixedUpdate!(ctx(world));
    expect(world.hasComponent("bot.3", "RagdollSpawnRequest")).toBe(false);
  });

  it("impulse points AWAY from the blast origin (DeathImpulse direction)", () => {
    const world = new World();
    addBomberWithMeshes(world, "bot.4", { gx: 5, gz: 5 });
    // Blast at (3, 5) → bomber at (5, 5) → impulse direction (+X, 0, 0).
    world.setComponent("bot.4", "DeathImpulse", { blastOriginGx: 3, blastOriginGz: 5, magnitude: 2 });
    const sys = createKaboomDeathTriggerSystem();
    sys.fixedUpdate!(ctx(world));
    world.setComponent("bot.4", "BomberStats", { alive: false });
    sys.fixedUpdate!(ctx(world));
    const req = world.getComponent<{ impulse: number[] }>("bot.4", "RagdollSpawnRequest")!;
    expect(req.impulse[0]).toBeCloseTo(2, 5); // +X, magnitude 2
    expect(req.impulse[1]).toBeGreaterThan(0); // upward lift
    expect(req.impulse[2]).toBeCloseTo(0, 5);
  });

  it("without DeathImpulse, default impulse is downfield (-Z) at magnitude 1", () => {
    const world = new World();
    addBomberWithMeshes(world, "bot.5");
    const sys = createKaboomDeathTriggerSystem();
    sys.fixedUpdate!(ctx(world));
    world.setComponent("bot.5", "BomberStats", { alive: false });
    sys.fixedUpdate!(ctx(world));
    const req = world.getComponent<{ impulse: number[] }>("bot.5", "RagdollSpawnRequest")!;
    expect(req.impulse[0]).toBe(0);
    expect(req.impulse[1]).toBeGreaterThan(0);
    expect(req.impulse[2]).toBeCloseTo(-1, 5);
  });

  it("Transform.parent cleared on each mesh entity that exists", () => {
    const world = new World();
    addBomberWithMeshes(world, "bot.6");
    const sys = createKaboomDeathTriggerSystem();
    sys.fixedUpdate!(ctx(world));
    world.setComponent("bot.6", "BomberStats", { alive: false });
    sys.fixedUpdate!(ctx(world));
    for (const suffix of MESH_SUFFIXES) {
      const t = world.getComponent<{ parent?: string }>(`bot.6.${suffix}`, "Transform");
      expect(t?.parent).toBeUndefined();
    }
  });

  it("missing mesh entities are silently skipped from meshMap", () => {
    const world = new World();
    world.addEntity("bot.7");
    world.setComponent("bot.7", "Transform", { position: [5, 0, 5] });
    world.setComponent("bot.7", "BomberStats", { alive: true });
    // Only spawn torso + head; the other 8 are missing.
    world.addEntity("bot.7.torso");
    world.setComponent("bot.7.torso", "Transform", { position: [0, 0, 0], parent: "bot.7" });
    world.addEntity("bot.7.head");
    world.setComponent("bot.7.head", "Transform", { position: [0, 0, 0], parent: "bot.7" });
    const sys = createKaboomDeathTriggerSystem();
    sys.fixedUpdate!(ctx(world));
    world.setComponent("bot.7", "BomberStats", { alive: false });
    sys.fixedUpdate!(ctx(world));
    const req = world.getComponent<{ meshMap: Record<string, string> }>("bot.7", "RagdollSpawnRequest")!;
    expect(Object.keys(req.meshMap).length).toBe(2);
    expect(req.meshMap["torso"]).toBe("bot.7.torso");
    expect(req.meshMap["head"]).toBe("bot.7.head");
  });

  it("ignores subsequent ticks if RagdollSpawnRequest still present (defensive guard)", () => {
    const world = new World();
    addBomberWithMeshes(world, "bot.8");
    const sys = createKaboomDeathTriggerSystem();
    sys.fixedUpdate!(ctx(world));
    world.setComponent("bot.8", "BomberStats", { alive: false });
    sys.fixedUpdate!(ctx(world));
    const before = world.getComponent("bot.8", "RagdollSpawnRequest");
    sys.fixedUpdate!(ctx(world));
    const after = world.getComponent("bot.8", "RagdollSpawnRequest");
    expect(after).toEqual(before);
  });
});
