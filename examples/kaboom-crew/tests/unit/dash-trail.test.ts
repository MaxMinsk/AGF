// S197 — dash-trail-system co-spawns a short-lived ParticleEmitter at
// the bomber's Transform position every TRAIL_INTERVAL_S while
// BomberStats.dashing is true.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomDashTrailSystem } from "../../src/systems/dash-trail-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomber(world: World, id: string, x: number, z: number, dashing: boolean): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, dashing });
  world.setComponent(id, "Transform", {
    position: [x, 0.4, z],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
}

function countPuffs(world: World): number {
  let n = 0;
  for (const id of world.entityIds()) {
    if (id.startsWith("kaboom.dash-trail.") && world.hasComponent(id, "ParticleEmitter")) n += 1;
  }
  return n;
}

describe("kaboom dash trail (S197)", () => {
  it("idle bomber (not dashing): no puffs spawn", () => {
    const world = new World();
    addBomber(world, "p", 5, 5, false);
    const sys = createKaboomDashTrailSystem();
    for (let i = 0; i < 60; i += 1) sys.fixedUpdate!(ctx(world));
    expect(countPuffs(world)).toBe(0);
  });

  it("dashing bomber spawns at least 4 puffs across the 200ms dash window", () => {
    const world = new World();
    addBomber(world, "p", 5, 5, true);
    const sys = createKaboomDashTrailSystem();
    // 200ms / (1/60s) = 12 ticks
    for (let i = 0; i < 12; i += 1) sys.fixedUpdate!(ctx(world));
    expect(countPuffs(world)).toBeGreaterThanOrEqual(4);
  });

  it("puffs stop accumulating after the bomber stops dashing", () => {
    const world = new World();
    addBomber(world, "p", 5, 5, true);
    const sys = createKaboomDashTrailSystem();
    for (let i = 0; i < 12; i += 1) sys.fixedUpdate!(ctx(world));
    const duringDash = countPuffs(world);
    world.setComponent("p", "BomberStats", { maxBombs: 1, range: 2, dashing: false });
    for (let i = 0; i < 60; i += 1) sys.fixedUpdate!(ctx(world));
    expect(countPuffs(world)).toBe(duringDash);
  });

  it("puffs spawn at the bomber's current Transform position", () => {
    const world = new World();
    addBomber(world, "p", 7, 3, true);
    const sys = createKaboomDashTrailSystem();
    sys.fixedUpdate!(ctx(world, 0.04)); // 40ms > TRAIL_INTERVAL_S
    let found = false;
    for (const id of world.entityIds()) {
      if (!id.startsWith("kaboom.dash-trail.")) continue;
      const t = world.getComponent<{ position?: ReadonlyArray<number> }>(id, "Transform");
      const [x, , z] = t!.position!;
      if (x === 7 && z === 3) found = true;
    }
    expect(found).toBe(true);
  });
});
