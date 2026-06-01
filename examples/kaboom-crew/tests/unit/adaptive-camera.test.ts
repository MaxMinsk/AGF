// S212 KABOOM-CAMERA-ADAPTIVE-FOLLOW (GDP-2026-05-29-008). Covers
// the pure `adaptiveFollowFactor` helper + the system-level
// behaviour: targetFollow scales per axis by the factor while the
// existing FOLLOW_OFFSET clamp + damping stay untouched.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";

import {
  ADAPTIVE_FOLLOW_MIN_PARALLAX_DEFAULT,
  ADAPTIVE_FOLLOW_VIEW_TILES_DEFAULT,
  adaptiveFollowFactor,
  createKaboomCameraControlSystem
} from "../../src/systems/camera-control-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function setupCamera(world: World, position = [5, 9, 11.3]): void {
  world.addEntity("camera.main");
  world.setComponent("camera.main", "Camera", { kind: "orthographic", active: true });
  world.setComponent("camera.main", "Transform", { position, rotation: [-55, 0, 0], scale: [1, 1, 1] });
}

function setupPlayer(world: World, position = [5, 0.4, 5]): void {
  world.addEntity("player.1");
  world.setComponent("player.1", "Transform", { position, rotation: [0, 0, 0], scale: [1, 1, 1] });
}

function cameraPos(world: World): [number, number, number] {
  const t = world.getComponent<{ position?: ReadonlyArray<number> }>("camera.main", "Transform");
  const p = t?.position ?? [0, 0, 0];
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
}

describe("kaboom adaptive camera follow (S212)", () => {
  it("adaptiveFollowFactor: fits-in-view arena (≤ view) collapses to minParallax", () => {
    expect(adaptiveFollowFactor(11, 11)).toBeCloseTo(ADAPTIVE_FOLLOW_MIN_PARALLAX_DEFAULT, 5);
    expect(adaptiveFollowFactor(7, 11)).toBeCloseTo(ADAPTIVE_FOLLOW_MIN_PARALLAX_DEFAULT, 5);
    expect(adaptiveFollowFactor(11, 11, 0)).toBe(0);
  });

  it("adaptiveFollowFactor: 16×11 view returns (16-11)/16 = 0.3125", () => {
    expect(adaptiveFollowFactor(16, 11)).toBeCloseTo((16 - 11) / 16, 5);
  });

  it("adaptiveFollowFactor: very wide arena approaches 1", () => {
    expect(adaptiveFollowFactor(100, 11)).toBeCloseTo(0.89, 2);
  });

  it("adaptiveFollowFactor: minParallax floor wins on small arenas", () => {
    expect(adaptiveFollowFactor(5, 11, 0.5)).toBe(0.5);
  });

  it("adaptiveFollowFactor: invalid input returns 1 (full follow)", () => {
    expect(adaptiveFollowFactor(0, 11)).toBe(1);
    expect(adaptiveFollowFactor(NaN as unknown as number, 11)).toBe(1);
  });

  it("default ADAPTIVE_FOLLOW_VIEW_TILES_DEFAULT = 11", () => {
    expect(ADAPTIVE_FOLLOW_VIEW_TILES_DEFAULT).toBe(11);
  });

  it("system: with adaptive ON + fits-in-view arena, camera barely follows (~minParallax × delta)", () => {
    const world = new World();
    setupCamera(world, [5, 9, 5]);
    setupPlayer(world, [5, 0.4, 5]); // at authored anchor
    const sys = createKaboomCameraControlSystem({
      followMode: "snap",
      arenaSize: { width: 11, depth: 11 }, // pit-like, fits in view 11
      viewTilesWide: 11,
      rng: () => 0.5 // no shake jitter (envelope=0 anyway)
    });
    sys.fixedUpdate!(ctx(world));
    // Authored anchor captured. Now move player by +5 cells in X.
    world.setComponent("player.1", "Transform", { position: [10, 0.4, 5], rotation: [0, 0, 0], scale: [1, 1, 1] });
    sys.fixedUpdate!(ctx(world));
    const [cx] = cameraPos(world);
    // Expected ≈ authoredX + minParallax * 5 = 5 + 0.25 = 5.25.
    expect(cx).toBeCloseTo(5 + ADAPTIVE_FOLLOW_MIN_PARALLAX_DEFAULT * 5, 5);
  });

  it("system: with adaptive ON + wide-arena X, camera follows much more on X than Z", () => {
    const world = new World();
    setupCamera(world, [5, 9, 5]);
    setupPlayer(world, [5, 0.4, 5]);
    const sys = createKaboomCameraControlSystem({
      followMode: "snap",
      arenaSize: { width: 16, depth: 6 }, // corridor-like
      viewTilesWide: 11,
      rng: () => 0.5
    });
    sys.fixedUpdate!(ctx(world));
    world.setComponent("player.1", "Transform", { position: [10, 0.4, 8], rotation: [0, 0, 0], scale: [1, 1, 1] });
    sys.fixedUpdate!(ctx(world));
    const [cx, , cz] = cameraPos(world);
    const factorX = adaptiveFollowFactor(16, 11);
    const expectedCx = 5 + factorX * 5;
    const expectedCz = 5 + ADAPTIVE_FOLLOW_MIN_PARALLAX_DEFAULT * 3;
    expect(cx).toBeCloseTo(expectedCx, 5);
    expect(cz).toBeCloseTo(expectedCz, 5);
  });

  it("system: adaptiveDisabled=true reverts to S195 full-rate follow", () => {
    const world = new World();
    setupCamera(world, [5, 9, 5]);
    setupPlayer(world, [5, 0.4, 5]);
    const sys = createKaboomCameraControlSystem({
      followMode: "snap",
      arenaSize: { width: 11, depth: 11 },
      viewTilesWide: 11,
      adaptiveDisabled: true,
      rng: () => 0.5
    });
    sys.fixedUpdate!(ctx(world));
    world.setComponent("player.1", "Transform", { position: [8, 0.4, 5], rotation: [0, 0, 0], scale: [1, 1, 1] });
    sys.fixedUpdate!(ctx(world));
    const [cx] = cameraPos(world);
    // Expected = authoredX + 3 (clamped to MAX_FOLLOW_OFFSET).
    expect(cx).toBeCloseTo(5 + 3, 5);
  });

  it("system: arenaSize() thunk is read each tick (map switch updates follow factor live)", () => {
    const world = new World();
    setupCamera(world, [5, 9, 5]);
    setupPlayer(world, [5, 0.4, 5]);
    let currentMap = { width: 11, depth: 11 };
    const sys = createKaboomCameraControlSystem({
      followMode: "snap",
      arenaSize: () => currentMap,
      viewTilesWide: 11,
      rng: () => 0.5
    });
    sys.fixedUpdate!(ctx(world));
    // Switch to corridor mid-session.
    currentMap = { width: 16, depth: 6 };
    world.setComponent("player.1", "Transform", { position: [10, 0.4, 5], rotation: [0, 0, 0], scale: [1, 1, 1] });
    sys.fixedUpdate!(ctx(world));
    const [cx] = cameraPos(world);
    // Should now follow with factorX = (16-11)/16 = 0.3125, NOT the
    // fits-in-view minParallax (which would give 5.25).
    expect(cx).toBeCloseTo(5 + adaptiveFollowFactor(16, 11) * 5, 5);
  });
});
