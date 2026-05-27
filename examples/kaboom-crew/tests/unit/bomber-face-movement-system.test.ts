// S108 KABOOM-BOMBER-FACE-MOVEMENT.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  createKaboomBomberFaceMovementSystem,
  directionToYawDeg,
  shortestAngularDeltaDeg,
  stepYawLerp,
  SMOOTH_ROTATION_DURATION_MS
} from "../../src/systems/bomber-face-movement-system";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function addPlayer(world: World, opts: { gx?: number; gz?: number; lerp?: number; targetGx?: number; targetGz?: number; queued?: { dx: number; dz: number }; alive?: boolean }) {
  world.addEntity("player.1");
  world.setComponent("player.1", "PlayerControlled", { speed: 4 });
  world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: opts.alive ?? true });
  world.setComponent("player.1", "GridPosition", { gx: opts.gx ?? 0, gz: opts.gz ?? 0 });
  world.setComponent("player.1", "GridMover", {
    speed: 4,
    currentLerp: opts.lerp ?? 0,
    queuedDirection: opts.queued ?? { dx: 0, dz: 0 },
    ...(opts.targetGx !== undefined ? { targetGx: opts.targetGx } : {}),
    ...(opts.targetGz !== undefined ? { targetGz: opts.targetGz } : {})
  });
  world.setComponent("player.1", "Transform", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
}

describe("directionToYawDeg (S108 pure helper)", () => {
  it("zero direction = 0 yaw", () => {
    expect(directionToYawDeg(0, 0)).toBe(0);
  });
  it("(+X, 0) = +90°", () => {
    expect(directionToYawDeg(1, 0)).toBeCloseTo(90, 5);
  });
  it("(-X, 0) = -90°", () => {
    expect(directionToYawDeg(-1, 0)).toBeCloseTo(-90, 5);
  });
  it("(0, -Z) = 0° (Three.js default forward)", () => {
    expect(directionToYawDeg(0, -1)).toBeCloseTo(0, 5);
  });
  it("(0, +Z) = ±180°", () => {
    expect(Math.abs(directionToYawDeg(0, 1))).toBeCloseTo(180, 5);
  });
});

describe("shortestAngularDeltaDeg (S157)", () => {
  it("zero delta when already at target", () => {
    expect(shortestAngularDeltaDeg(90, 90)).toBe(0);
  });
  it("90° → 0° = -90 (shortest CCW)", () => {
    expect(shortestAngularDeltaDeg(90, 0)).toBe(-90);
  });
  it("0° → 90° = +90 (shortest CW)", () => {
    expect(shortestAngularDeltaDeg(0, 90)).toBe(90);
  });
  it("175° → -175° = +10 (wrap-around CW)", () => {
    expect(shortestAngularDeltaDeg(175, -175)).toBe(10);
  });
  it("-175° → 175° = -10 (wrap-around CCW)", () => {
    expect(shortestAngularDeltaDeg(-175, 175)).toBe(-10);
  });
  it("exactly opposite (0° → 180°) picks +180 deterministically", () => {
    expect(shortestAngularDeltaDeg(0, 180)).toBe(180);
  });
});

describe("stepYawLerp (S157)", () => {
  it("elapsedSec <= 0 returns startYaw unchanged", () => {
    expect(stepYawLerp(45, 90, 0, 120)).toBe(45);
    expect(stepYawLerp(45, 90, -0.1, 120)).toBe(45);
  });
  it("elapsedSec covering full duration snaps to target", () => {
    expect(stepYawLerp(0, 90, 0.2, 120)).toBe(90);
    expect(stepYawLerp(0, 90, 0.12, 120)).toBe(90);
  });
  it("one fixedUpdate of elapsed (1/60s) covers ~14% of the angular delta", () => {
    const r = stepYawLerp(0, 90, 1 / 60, 120);
    expect(r).toBeGreaterThan(11);
    expect(r).toBeLessThan(14);
  });
  it("converges to target over the lerp window (elapsed-based, no Zeno decay)", () => {
    // Elapsed-based: startYaw=0 fixed, elapsedSec accumulates. After
    // elapsed ≥ duration the function snaps to target.
    let elapsedSec = 0;
    let cur = 0;
    for (let i = 0; i < 10; i += 1) {
      elapsedSec += 1 / 60;
      cur = stepYawLerp(0, 90, elapsedSec, 120);
    }
    expect(cur).toBeCloseTo(90, 1);
  });
  it("default lerp duration is 120 ms (the GDP value)", () => {
    expect(SMOOTH_ROTATION_DURATION_MS).toBe(120);
  });
});

// S157 — helper: run enough ticks to converge the 120 ms angular lerp.
function tickToConverge(world: World, sys: ReturnType<typeof createKaboomBomberFaceMovementSystem>): void {
  // 12 ticks × 1/60s ≈ 200 ms, past the 120ms lerp duration.
  for (let i = 0; i < 12; i += 1) sys.fixedUpdate!(ctx(world));
}

describe("createKaboomBomberFaceMovementSystem (S108 + S157 smooth-rotation)", () => {
  it("queuedDirection settles to the target yaw after the lerp window (~120 ms)", () => {
    const world = new World();
    addPlayer(world, { queued: { dx: 1, dz: 0 } });
    const system = createKaboomBomberFaceMovementSystem();
    tickToConverge(world, system);
    const t = world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1", "Transform")!;
    expect(t.rotation[1]!).toBeCloseTo(90, 3);
  });

  it("S157 — single tick covers a fraction of the angular delta (smooth, not snap)", () => {
    const world = new World();
    addPlayer(world, { queued: { dx: 1, dz: 0 } });
    const system = createKaboomBomberFaceMovementSystem();
    system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1", "Transform")!;
    // dt=1/60s ≈ 16.67 ms; 16.67/120 ≈ 0.139 of 90° ≈ 12.5°. Allow a
    // generous bracket so float drift doesn't trip this.
    expect(t.rotation[1]!).toBeGreaterThan(5);
    expect(t.rotation[1]!).toBeLessThan(20);
  });

  it("mid-lerp target overrides queued direction", () => {
    const world = new World();
    addPlayer(world, { gx: 2, gz: 2, lerp: 0.5, targetGx: 2, targetGz: 1, queued: { dx: 1, dz: 0 } });
    const system = createKaboomBomberFaceMovementSystem();
    tickToConverge(world, system);
    const t = world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1", "Transform")!;
    // Target is (2, 1), pos (2, 2) → direction (0, -1) → yaw 0°.
    expect(t.rotation[1]!).toBeCloseTo(0, 3);
  });

  it("S157 — shortest-path angular lerp: 0° → 270° goes via -90° (not the long way)", () => {
    // 270° = -90° in the shortest-path metric. After convergence the
    // visual yaw should be at -90° (or equivalently 270° mod 360° —
    // we store -90° because the delta math picked that side).
    const world = new World();
    addPlayer(world, { queued: { dx: -1, dz: 0 } }); // -X → -90° target
    const system = createKaboomBomberFaceMovementSystem();
    // Set initial transform.y to 0 already (default), so the lerp goes
    // 0 → -90 over 120ms. Verify the SIGN — never spins through +180°.
    let prevYaw = 0;
    for (let i = 0; i < 12; i += 1) {
      system.fixedUpdate!(ctx(world));
      const cur = (world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1", "Transform")!).rotation[1]!;
      expect(cur).toBeLessThanOrEqual(prevYaw + 1e-9); // monotonic decreasing (negative direction)
      prevYaw = cur;
    }
    expect(prevYaw).toBeCloseTo(-90, 3);
  });

  it("preserves yaw when bomber is stationary + no queued direction", () => {
    const world = new World();
    addPlayer(world, {});
    world.setComponent("player.1", "Transform", { position: [0, 0, 0], rotation: [0, 45, 0], scale: [1, 1, 1] });
    const system = createKaboomBomberFaceMovementSystem();
    system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1", "Transform")!;
    expect(t.rotation[1]).toBe(45);
  });

  it("skips dead bombers (lets the ragdoll arc own rotation)", () => {
    const world = new World();
    addPlayer(world, { queued: { dx: 1, dz: 0 }, alive: false });
    world.setComponent("player.1", "Transform", { position: [0, 0, 0], rotation: [10, 33, 0], scale: [1, 1, 1] });
    const system = createKaboomBomberFaceMovementSystem();
    system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1", "Transform")!;
    expect(t.rotation[1]).toBe(33);
  });
});
