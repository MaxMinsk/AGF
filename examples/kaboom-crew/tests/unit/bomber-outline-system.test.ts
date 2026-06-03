// S273 KABOOM-OUTLINE-OCCLUDER — bomber outline duplicate spawn system.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  createKaboomBomberOutlineSystem,
  outlineEntityIdFor,
  torsoEntityIdFor
} from "../../src/systems/bomber-outline-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomberWithTorso(world: World, rootId: string, opts: { meshRef?: string } = {}): void {
  const meshRef = opts.meshRef ?? `procedural:procbomber-torso#${rootId}`;
  world.addEntity(rootId);
  world.setComponent(rootId, "BomberStats", { maxBombs: 1, range: 2, alive: true });
  const torsoId = torsoEntityIdFor(rootId);
  world.addEntity(torsoId);
  world.setComponent(torsoId, "Transform", { parent: rootId, position: [0, 0.6, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  world.setComponent(torsoId, "MeshRenderer", { mesh: meshRef, color: "#ff0000" });
}

describe("createKaboomBomberOutlineSystem (S273)", () => {
  it("disabled → no outline entity spawns", () => {
    const world = new World();
    addBomberWithTorso(world, "player.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: false });
    sys.fixedUpdate!(ctx(world));
    expect(world.hasEntity(outlineEntityIdFor("player.1"))).toBe(false);
  });

  it("spawns an outline duplicate parented to the torso, with depthFunc='greater' + depthWrite=false + same mesh ref", () => {
    const world = new World();
    addBomberWithTorso(world, "player.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    const outlineId = outlineEntityIdFor("player.1");
    expect(world.hasEntity(outlineId)).toBe(true);
    const transform = world.getComponent<{ parent?: string }>(outlineId, "Transform")!;
    expect(transform.parent).toBe(torsoEntityIdFor("player.1"));
    const mesh = world.getComponent<{
      mesh?: string;
      color?: string;
      depthFunc?: string;
      depthWrite?: boolean;
      transparent?: boolean;
      opacity?: number;
      polygonOffset?: { factor: number; units: number };
    }>(outlineId, "MeshRenderer")!;
    expect(mesh.mesh).toBe("procedural:procbomber-torso#player.1");
    expect(mesh.depthFunc).toBe("greater");
    expect(mesh.depthWrite).toBe(false);
    expect(mesh.transparent).toBe(true);
    expect(mesh.opacity).toBeCloseTo(0.85, 4);
    expect(mesh.polygonOffset).toEqual({ factor: -1, units: -1 });
  });

  it("picks up the bomber palette color (player.1 → sky tint)", () => {
    const world = new World();
    addBomberWithTorso(world, "player.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    const mesh = world.getComponent<{ color?: string }>(outlineEntityIdFor("player.1"), "MeshRenderer")!;
    expect(mesh.color).toBe("#3ab0ff");
  });

  it("hunter bot → ember tint", () => {
    const world = new World();
    addBomberWithTorso(world, "bot.1");
    world.setComponent("bot.1", "BotBrain", { aggression: 0, personality: "hunter" });
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    const mesh = world.getComponent<{ color?: string }>(outlineEntityIdFor("bot.1"), "MeshRenderer")!;
    expect(mesh.color).toBe("#e65a3a");
  });

  it("unknown placer falls back to the default outline color (#7fd6ff)", () => {
    const world = new World();
    addBomberWithTorso(world, "rando.99");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    const mesh = world.getComponent<{ color?: string }>(outlineEntityIdFor("rando.99"), "MeshRenderer")!;
    expect(mesh.color).toBe("#7fd6ff");
  });

  it("is idempotent — repeated ticks don't re-spawn or churn the component", () => {
    const world = new World();
    addBomberWithTorso(world, "player.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    const before = world.getComponent("player.1.torso-outline", "MeshRenderer");
    for (let i = 0; i < 5; i += 1) sys.fixedUpdate!(ctx(world));
    const after = world.getComponent("player.1.torso-outline", "MeshRenderer");
    // The component object reference can change because setComponent
    // is only called on the FIRST tick; subsequent ticks short-circuit
    // through the `seen` cache. Either way the content should match.
    expect(after).toEqual(before);
  });

  it("respawns the outline if it gets deleted between ticks (defensive)", () => {
    const world = new World();
    addBomberWithTorso(world, "player.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    // Editor / probe deletes the outline.
    world.removeEntity("player.1.torso-outline");
    expect(world.hasEntity("player.1.torso-outline")).toBe(false);
    sys.fixedUpdate!(ctx(world));
    expect(world.hasEntity("player.1.torso-outline")).toBe(true);
  });

  it("bomber without a torso entity → no outline spawned (no crash)", () => {
    const world = new World();
    world.addEntity("bot.x");
    world.setComponent("bot.x", "BomberStats", { maxBombs: 1, range: 2, alive: true });
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    expect(world.hasEntity(outlineEntityIdFor("bot.x"))).toBe(false);
  });

  it("clears the seen cache on world swap", () => {
    const world1 = new World();
    addBomberWithTorso(world1, "player.1");
    const sys = createKaboomBomberOutlineSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world1));
    expect(world1.hasEntity(outlineEntityIdFor("player.1"))).toBe(true);
    // Fresh world — the cache should reset so the new bomber is processed.
    const world2 = new World();
    addBomberWithTorso(world2, "player.1");
    sys.fixedUpdate!(ctx(world2));
    expect(world2.hasEntity(outlineEntityIdFor("player.1"))).toBe(true);
  });
});
