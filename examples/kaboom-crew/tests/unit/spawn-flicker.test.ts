// S215 KABOOM-CAMERA-SPAWN-FLICKER (GDP-2026-05-29-003 part 2).
// Covers the pure easing helper + system-level edge detection: the
// dip fires on initial player spawn AND on round restart (phase
// resolved → playing), and is bypassed when spawnFlickerDisabled.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";

import {
  SPAWN_FLICKER_DURATION_S_DEFAULT,
  SPAWN_FLICKER_Y_OFFSET_DEFAULT,
  createKaboomCameraControlSystem,
  spawnFlickerYAt
} from "../../src/systems/camera-control-system";

function ctx(world: World, elapsed = 0, dt = 1 / 60) {
  return {
    world,
    time: { elapsed, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function setupCamera(world: World, position = [5, 9, 5]): void {
  world.addEntity("camera.main");
  world.setComponent("camera.main", "Camera", { kind: "orthographic", active: true });
  world.setComponent("camera.main", "Transform", { position, rotation: [-55, 0, 0], scale: [1, 1, 1] });
}

function setupPlayer(world: World, position = [5, 0.4, 5]): void {
  world.addEntity("player.1");
  world.setComponent("player.1", "Transform", { position, rotation: [0, 0, 0], scale: [1, 1, 1] });
}

function setupRoundState(world: World, phase = "playing"): void {
  if (!world.hasEntity("kaboom.round-state")) world.addEntity("kaboom.round-state");
  world.setComponent("kaboom.round-state", "RoundState", { phase });
}

function cameraY(world: World): number {
  const t = world.getComponent<{ position?: ReadonlyArray<number> }>("camera.main", "Transform");
  return t?.position?.[1] ?? 0;
}

describe("kaboom spawn flicker (S215)", () => {
  it("spawnFlickerYAt: t=0 returns peak, t=duration returns 0, monotonically decreasing", () => {
    expect(spawnFlickerYAt(0)).toBeCloseTo(SPAWN_FLICKER_Y_OFFSET_DEFAULT, 5);
    expect(spawnFlickerYAt(SPAWN_FLICKER_DURATION_S_DEFAULT)).toBe(0);
    let prev = SPAWN_FLICKER_Y_OFFSET_DEFAULT + 1;
    for (let t = 0; t <= SPAWN_FLICKER_DURATION_S_DEFAULT; t += 0.02) {
      const y = spawnFlickerYAt(t);
      expect(y).toBeLessThanOrEqual(prev + 1e-9);
      prev = y;
    }
  });

  it("spawnFlickerYAt: t past duration stays 0", () => {
    expect(spawnFlickerYAt(SPAWN_FLICKER_DURATION_S_DEFAULT + 1)).toBe(0);
  });

  it("system: initial spawn lifts camera Y by ~peak on tick 0, decays to ~0 by duration", () => {
    const world = new World();
    setupCamera(world, [5, 9, 5]);
    setupPlayer(world);
    setupRoundState(world);
    const sys = createKaboomCameraControlSystem({
      followMode: "snap",
      rng: () => 0.5
    });
    // Tick 0 — player just appeared, flicker latches + dip is at peak (minus a sliver because the helper uses elapsedSince = 0 → peak).
    sys.fixedUpdate!(ctx(world, 0));
    const yAtSpawn = cameraY(world);
    expect(yAtSpawn).toBeCloseTo(9 + SPAWN_FLICKER_Y_OFFSET_DEFAULT, 1);
    // Advance past the flicker window.
    sys.fixedUpdate!(ctx(world, 1.0));
    const yAfter = cameraY(world);
    expect(yAfter).toBeCloseTo(9, 5);
  });

  it("system: disabled flag skips the dip entirely", () => {
    const world = new World();
    setupCamera(world, [5, 9, 5]);
    setupPlayer(world);
    setupRoundState(world);
    const sys = createKaboomCameraControlSystem({
      followMode: "snap",
      spawnFlickerDisabled: true,
      rng: () => 0.5
    });
    sys.fixedUpdate!(ctx(world, 0));
    expect(cameraY(world)).toBeCloseTo(9, 5);
  });

  it("system: round restart (phase resolved → playing) re-fires the dip", () => {
    const world = new World();
    setupCamera(world, [5, 9, 5]);
    setupPlayer(world);
    setupRoundState(world, "playing");
    const sys = createKaboomCameraControlSystem({
      followMode: "snap",
      rng: () => 0.5
    });
    // Tick 0 — initial dip latches; advance well past duration.
    sys.fixedUpdate!(ctx(world, 0));
    sys.fixedUpdate!(ctx(world, 2));
    expect(cameraY(world)).toBeCloseTo(9, 5);
    // Round resolves...
    setupRoundState(world, "won");
    sys.fixedUpdate!(ctx(world, 3));
    // ...and restarts.
    setupRoundState(world, "playing");
    sys.fixedUpdate!(ctx(world, 4));
    expect(cameraY(world)).toBeCloseTo(9 + SPAWN_FLICKER_Y_OFFSET_DEFAULT, 1);
  });

  it("system: custom durationS + yOffset compose into the dip math", () => {
    const world = new World();
    setupCamera(world, [5, 9, 5]);
    setupPlayer(world);
    setupRoundState(world);
    const sys = createKaboomCameraControlSystem({
      followMode: "snap",
      spawnFlickerDurationS: 0.5,
      spawnFlickerYOffset: 3,
      rng: () => 0.5
    });
    sys.fixedUpdate!(ctx(world, 0));
    expect(cameraY(world)).toBeCloseTo(9 + 3, 1);
    sys.fixedUpdate!(ctx(world, 0.5));
    expect(cameraY(world)).toBeCloseTo(9, 5);
  });
});
