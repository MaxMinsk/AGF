// S101 PROCBOMBER-BENCH-ANIM-DROPDOWN — pure helpers + system loop.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  createBenchAnimationSystem,
  IDLE_BOB_AMPLITUDE,
  IDLE_BOB_FREQ_HZ,
  WALK_SWING_AMPLITUDE_X,
  WALK_SWING_FREQ_HZ,
  idleBobY,
  walkSwingX
} from "../../src/systems/bench-animation-system";

function ctx(world: World, fixedDt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomber(world: World, kind: "none" | "idle-bob" | "walk-swing", basePosition: [number, number, number] = [0, 0, 0]) {
  world.addEntity("bomber.1");
  world.setComponent("bomber.1", "Transform", {
    position: basePosition,
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent("bomber.1", "BenchAnimationState", { kind, elapsed: 0 });
}

describe("idleBobY (S101 pure helper)", () => {
  it("returns the base at elapsed=0", () => {
    expect(idleBobY(0, 0)).toBeCloseTo(0, 6);
    expect(idleBobY(0, 1.5)).toBeCloseTo(1.5, 6);
  });
  it("peaks at quarter-period above the base", () => {
    const quarter = 1 / (4 * IDLE_BOB_FREQ_HZ);
    expect(idleBobY(quarter, 0)).toBeCloseTo(IDLE_BOB_AMPLITUDE, 6);
  });
  it("returns the base again at half-period", () => {
    const half = 1 / (2 * IDLE_BOB_FREQ_HZ);
    expect(idleBobY(half, 0)).toBeCloseTo(0, 6);
  });
});

describe("walkSwingX (S101 pure helper)", () => {
  it("returns the base at elapsed=0", () => {
    expect(walkSwingX(0, 0)).toBeCloseTo(0, 6);
  });
  it("peaks at quarter-period on the +X side", () => {
    const quarter = 1 / (4 * WALK_SWING_FREQ_HZ);
    expect(walkSwingX(quarter, 0)).toBeCloseTo(WALK_SWING_AMPLITUDE_X, 6);
  });
});

describe("createBenchAnimationSystem (S101)", () => {
  it("writes Transform.position.y above the base when kind=idle-bob (after a few ticks)", () => {
    const world = new World();
    addBomber(world, "idle-bob");
    const system = createBenchAnimationSystem();
    // Step ~quarter-period of idle-bob (≈ 0.156 s) so the sine peaks.
    const ticks = Math.round(1 / (4 * IDLE_BOB_FREQ_HZ) / (1 / 60));
    for (let i = 0; i < ticks; i += 1) system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("bomber.1", "Transform")!;
    expect(t.position[1]!).toBeGreaterThan(0);
  });

  it("writes Transform.position.x off-center when kind=walk-swing", () => {
    const world = new World();
    addBomber(world, "walk-swing");
    const system = createBenchAnimationSystem();
    const ticks = Math.round(1 / (4 * WALK_SWING_FREQ_HZ) / (1 / 60));
    for (let i = 0; i < ticks; i += 1) system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("bomber.1", "Transform")!;
    expect(Math.abs(t.position[0]!)).toBeGreaterThan(0);
  });

  it("kind=none snaps back to the base position (no drift)", () => {
    const world = new World();
    addBomber(world, "none", [0.1, 0.2, 0.3]);
    const system = createBenchAnimationSystem();
    for (let i = 0; i < 30; i += 1) system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("bomber.1", "Transform")!;
    expect(t.position[0]).toBeCloseTo(0.1, 5);
    expect(t.position[1]).toBeCloseTo(0.2, 5);
    expect(t.position[2]).toBeCloseTo(0.3, 5);
  });

  it("preserves the bomber's z coordinate across all kinds", () => {
    const world = new World();
    addBomber(world, "idle-bob", [0, 0, 1.5]);
    const system = createBenchAnimationSystem();
    for (let i = 0; i < 10; i += 1) system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("bomber.1", "Transform")!;
    expect(t.position[2]).toBeCloseTo(1.5, 5);
  });

  it("flipping the kind back to none after idle-bob returns to base", () => {
    const world = new World();
    addBomber(world, "idle-bob");
    const system = createBenchAnimationSystem();
    for (let i = 0; i < 10; i += 1) system.fixedUpdate!(ctx(world));
    // Flip kind = none + reset elapsed.
    world.setComponent("bomber.1", "BenchAnimationState", { kind: "none", elapsed: 0 });
    system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("bomber.1", "Transform")!;
    expect(t.position[1]).toBeCloseTo(0, 5);
    expect(t.position[0]).toBeCloseTo(0, 5);
  });
});
