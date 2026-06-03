// S273 + S274 KABOOM-OUTLINE-OCCLUDER — bomber outline pillar +
// stencil-mask test coverage.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  BOMBER_STENCIL_REF,
  createKaboomBomberOutlineSystem,
  OUTLINE_PILLAR_DIMS,
  outlineEntityIdFor
} from "../../src/systems/bomber-outline-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomber(world: World, rootId: string): void {
  world.addEntity(rootId);
  world.setComponent(rootId, "BomberStats", { maxBombs: 1, range: 2, alive: true });
  world.setComponent(rootId, "Transform", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
}

function addBomberPart(world: World, bomberRoot: string, partSuffix: string, meshRef: string): string {
  const id = `${bomberRoot}.${partSuffix}`;
  world.addEntity(id);
  world.setComponent(id, "Transform", { parent: bomberRoot, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  world.setComponent(id, "MeshRenderer", { mesh: meshRef, color: "#ff0000" });
  return id;
}

describe("createKaboomBomberOutlineSystem (S273 + S274)", () => {
  it("disabled → no outline pillar, no stencil stamping", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomberPart(world, "player.1", "torso", "procedural:procbomber-torso#player.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: false });
    sys.fixedUpdate!(ctx(world));
    expect(world.hasEntity(outlineEntityIdFor("player.1"))).toBe(false);
    const torso = world.getComponent<{ stencilWrite?: boolean }>("player.1.torso", "MeshRenderer")!;
    expect(torso.stencilWrite).toBeUndefined();
  });

  it("spawns a pillar at the bomber root with depthFunc='greater', stencilFunc='notEqual', stencilRef=BOMBER_STENCIL_REF", () => {
    const world = new World();
    addBomber(world, "player.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    const outlineId = outlineEntityIdFor("player.1");
    expect(world.hasEntity(outlineId)).toBe(true);
    const tr = world.getComponent<{ parent?: string; position?: ReadonlyArray<number>; scale?: ReadonlyArray<number> }>(outlineId, "Transform")!;
    expect(tr.parent).toBe("player.1");
    expect(tr.position).toEqual([0, OUTLINE_PILLAR_DIMS.centerY, 0]);
    expect(tr.scale).toEqual([OUTLINE_PILLAR_DIMS.width, OUTLINE_PILLAR_DIMS.height, OUTLINE_PILLAR_DIMS.width]);
    const mesh = world.getComponent<{
      mesh?: string;
      depthFunc?: string;
      depthWrite?: boolean;
      transparent?: boolean;
      opacity?: number;
      stencilFunc?: string;
      stencilRef?: number;
    }>(outlineId, "MeshRenderer")!;
    expect(mesh.mesh).toBe("cylinder");
    expect(mesh.depthFunc).toBe("greater");
    expect(mesh.depthWrite).toBe(false);
    expect(mesh.transparent).toBe(true);
    expect(mesh.opacity).toBeCloseTo(0.85, 4);
    expect(mesh.stencilFunc).toBe("notEqual");
    expect(mesh.stencilRef).toBe(BOMBER_STENCIL_REF);
  });

  it("stamps every bomber-part MeshRenderer with stencilWrite=true + stencilRef=BOMBER_STENCIL_REF + stencilFunc='always' + stencilZPass='replace'", () => {
    const world = new World();
    addBomber(world, "bot.1");
    world.setComponent("bot.1", "BotBrain", { aggression: 0, personality: "hunter" });
    addBomberPart(world, "bot.1", "torso", "procedural:procbomber-torso#bot.1");
    addBomberPart(world, "bot.1", "head", "procedural:procbomber-head#bot.1");
    addBomberPart(world, "bot.1", "upperArmL", "procedural:procbomber-upperArm#bot.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    for (const partId of ["bot.1.torso", "bot.1.head", "bot.1.upperArmL"]) {
      const mesh = world.getComponent<{
        stencilWrite?: boolean;
        stencilRef?: number;
        stencilFunc?: string;
        stencilZPass?: string;
      }>(partId, "MeshRenderer")!;
      expect(mesh.stencilWrite, `${partId}.stencilWrite`).toBe(true);
      expect(mesh.stencilRef, `${partId}.stencilRef`).toBe(BOMBER_STENCIL_REF);
      expect(mesh.stencilFunc, `${partId}.stencilFunc`).toBe("always");
      expect(mesh.stencilZPass, `${partId}.stencilZPass`).toBe("replace");
    }
  });

  it("DOES NOT stamp stencil on the outline pillar itself", () => {
    const world = new World();
    addBomber(world, "player.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    const pillar = world.getComponent<{
      stencilWrite?: boolean;
      stencilFunc?: string;
    }>(outlineEntityIdFor("player.1"), "MeshRenderer")!;
    // The pillar's stencilFunc must remain 'notEqual' (the test);
    // it should NOT have stencilZPass='replace' bolted on by the
    // stamp pass (that would make the pillar itself write the
    // stencil, blocking subsequent bomber updates).
    expect(pillar.stencilFunc).toBe("notEqual");
    expect(pillar.stencilWrite).toBeUndefined();
  });

  it("colour picks up the bomber palette (player.1 → sky, hunter → ember, unknown → fallback cyan)", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomber(world, "bot.1");
    world.setComponent("bot.1", "BotBrain", { aggression: 0, personality: "hunter" });
    addBomber(world, "rando.99");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    expect(world.getComponent<{ color?: string }>(outlineEntityIdFor("player.1"), "MeshRenderer")!.color).toBe("#3ab0ff");
    expect(world.getComponent<{ color?: string }>(outlineEntityIdFor("bot.1"), "MeshRenderer")!.color).toBe("#e65a3a");
    expect(world.getComponent<{ color?: string }>(outlineEntityIdFor("rando.99"), "MeshRenderer")!.color).toBe("#7fd6ff");
  });

  it("idempotency — multiple ticks don't re-create the pillar or churn part stamps", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomberPart(world, "player.1", "torso", "procedural:procbomber-torso#player.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    const torsoBefore = JSON.stringify(world.getComponent("player.1.torso", "MeshRenderer"));
    for (let i = 0; i < 5; i += 1) sys.fixedUpdate!(ctx(world));
    expect(JSON.stringify(world.getComponent("player.1.torso", "MeshRenderer"))).toBe(torsoBefore);
  });

  it("respawns the pillar if it gets deleted between ticks (defensive)", () => {
    const world = new World();
    addBomber(world, "player.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    world.removeEntity(outlineEntityIdFor("player.1"));
    expect(world.hasEntity(outlineEntityIdFor("player.1"))).toBe(false);
    sys.fixedUpdate!(ctx(world));
    expect(world.hasEntity(outlineEntityIdFor("player.1"))).toBe(true);
  });

  it("clears the seen cache on world swap (handles scene.load)", () => {
    const world1 = new World();
    addBomber(world1, "player.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world1));
    expect(world1.hasEntity(outlineEntityIdFor("player.1"))).toBe(true);
    const world2 = new World();
    addBomber(world2, "player.1");
    sys.fixedUpdate!(ctx(world2));
    expect(world2.hasEntity(outlineEntityIdFor("player.1"))).toBe(true);
  });

  it("stencil stamp picks up late-spawned parts on subsequent ticks", () => {
    const world = new World();
    addBomber(world, "bot.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    // Late-spawned mesh part (e.g. an accessory the recipe added).
    addBomberPart(world, "bot.1", "cap", "procedural:procbomber-accessory-cap#bot.1");
    sys.fixedUpdate!(ctx(world));
    const cap = world.getComponent<{ stencilWrite?: boolean; stencilRef?: number }>("bot.1.cap", "MeshRenderer")!;
    expect(cap.stencilWrite).toBe(true);
    expect(cap.stencilRef).toBe(BOMBER_STENCIL_REF);
  });
});
