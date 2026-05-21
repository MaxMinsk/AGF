// S104 KABOOM-BOMBER-ANIMATION-PROD + KABOOM-REACH-IK-PLACE-BOMB.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  createKaboomBomberAnimationDriverSystem,
  REACH_BURST_S
} from "../../src/systems/bomber-animation-driver";

function ctx(world: World, elapsed = 0, fixedDt = 1 / 60) {
  return {
    world,
    time: { elapsed, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addPlayer(world: World, opts: { alive?: boolean; lerp?: number; queuedDirection?: { dx: number; dz: number } } = {}) {
  world.addEntity("player.1");
  world.setComponent("player.1", "PlayerControlled", { speed: 4 });
  world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: opts.alive ?? true });
  world.setComponent("player.1", "GridMover", {
    speed: 4,
    currentLerp: opts.lerp ?? 0,
    queuedDirection: opts.queuedDirection ?? { dx: 0, dz: 0 }
  });
}

describe("bomber-animation-driver (S104)", () => {
  it("writes kind=idle-bob when the bomber is alive + standing still", () => {
    const world = new World();
    addPlayer(world);
    const system = createKaboomBomberAnimationDriverSystem();
    system.fixedUpdate!(ctx(world));
    const state = world.getComponent<{ kind: string }>("player.1", "BenchAnimationState");
    expect(state?.kind).toBe("idle-bob");
  });

  it("writes kind=walk-swing when GridMover.currentLerp > 0", () => {
    const world = new World();
    addPlayer(world, { lerp: 0.5 });
    const system = createKaboomBomberAnimationDriverSystem();
    system.fixedUpdate!(ctx(world));
    const state = world.getComponent<{ kind: string }>("player.1", "BenchAnimationState");
    expect(state?.kind).toBe("walk-swing");
  });

  it("writes kind=walk-swing when queuedDirection is non-zero (about to step)", () => {
    const world = new World();
    addPlayer(world, { queuedDirection: { dx: 1, dz: 0 } });
    const system = createKaboomBomberAnimationDriverSystem();
    system.fixedUpdate!(ctx(world));
    const state = world.getComponent<{ kind: string }>("player.1", "BenchAnimationState");
    expect(state?.kind).toBe("walk-swing");
  });

  it("writes kind=none when alive=false", () => {
    const world = new World();
    addPlayer(world, { alive: false, lerp: 0.5 });
    const system = createKaboomBomberAnimationDriverSystem();
    system.fixedUpdate!(ctx(world));
    const state = world.getComponent<{ kind: string }>("player.1", "BenchAnimationState");
    expect(state?.kind).toBe("none");
  });

  it("writes kind=reach for ~REACH_BURST_S seconds when PlaceBombRequest fires", () => {
    const world = new World();
    addPlayer(world);
    world.setComponent("player.1", "PlaceBombRequest", {});
    const system = createKaboomBomberAnimationDriverSystem();
    system.fixedUpdate!(ctx(world, 0));
    let state = world.getComponent<{ kind: string; reachEndsAt?: number }>("player.1", "BenchAnimationState");
    expect(state?.kind).toBe("reach");
    expect(state?.reachEndsAt).toBeCloseTo(REACH_BURST_S, 5);
    // After REACH_BURST_S + a tick, reverts to idle.
    world.removeComponent("player.1", "PlaceBombRequest");
    system.fixedUpdate!(ctx(world, REACH_BURST_S + 0.05));
    state = world.getComponent<{ kind: string }>("player.1", "BenchAnimationState");
    expect(state?.kind).toBe("idle-bob");
  });
});
