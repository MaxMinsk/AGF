// S163 KABOOM-CAMERA-FOLLOW unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  __CAMERA_FOLLOW_CONSTANTS,
  clampCameraToArena,
  createKaboomCameraFollowSystem
} from "../../src/systems/camera-follow-system";

function ctx(world: World, dt = 1 / 60) {
  return { world, time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 } };
}

function seedScene(world: World, opts: { sizeX?: number; sizeZ?: number; bomberAt?: [number, number] } = {}): void {
  const sizeX = opts.sizeX ?? 15;
  const sizeZ = opts.sizeZ ?? 11;
  world.addEntity("grid.config");
  world.setComponent("grid.config", "Grid", { sizeX, sizeZ, cellSize: 1, originX: 0, originZ: 0 });
  world.addEntity("camera.main");
  world.setComponent("camera.main", "Camera", { kind: "orthographic", active: true, orthographicSize: 8 });
  world.setComponent("camera.main", "Transform", { position: [7, 10, 10], rotation: [-55, 0, 0], scale: [1, 1, 1] });
  if (opts.bomberAt !== undefined) {
    world.addEntity("player.1");
    world.setComponent("player.1", "Transform", { position: [opts.bomberAt[0], 0.4, opts.bomberAt[1]], rotation: [0, 0, 0], scale: [1, 1, 1] });
    world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: true });
  }
}

describe("clampCameraToArena (S163 pure helper)", () => {
  it("centre stays put when target is inside the safe band", () => {
    const r = clampCameraToArena(8, 6, 6, 4, 0, 15, 0, 11);
    expect(r).toEqual({ x: 8, z: 6 });
  });
  it("left edge clamps so the left view bound aligns with arena left", () => {
    // view 6 wide, arena from x=0..15. Half-width = 3. Min x = 3.
    const r = clampCameraToArena(0, 6, 6, 4, 0, 15, 0, 11);
    expect(r.x).toBe(3);
  });
  it("right edge clamps so the right view bound aligns with arena right", () => {
    const r = clampCameraToArena(20, 6, 6, 4, 0, 15, 0, 11);
    expect(r.x).toBe(15 - 3);
  });
  it("view wider than arena → just centre on arena", () => {
    const r = clampCameraToArena(0, 6, 30, 4, 0, 15, 0, 11);
    expect(r.x).toBe((0 + 15) / 2);
  });
  it("z-axis clamps independently", () => {
    const r = clampCameraToArena(7, 100, 6, 4, 0, 15, 0, 11);
    expect(r.z).toBe(11 - 2);
  });
});

describe("createKaboomCameraFollowSystem (S163)", () => {
  it("follow mode: snaps the camera toward the bomber position over a few ticks", () => {
    const world = new World();
    seedScene(world, { bomberAt: [3, 3] });
    const sys = createKaboomCameraFollowSystem({ smoothing: 1 }); // snap
    sys.frameUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("camera.main", "Transform")!;
    // Bomber at (3, _, 3); arena 15×11; view ~11 tiles wide. Clamp keeps
    // camera near (3 clamped right ↑ to min-x, 3 clamped down ↑ to min-z).
    // With viewSize=6 default, viewWidth ≈ 21.3, viewDepth=12, both >= arena
    // dims, so camera lands at arena centre (7, ~, 5). Camera offset adds [0,10,7].
    expect(t.position[0]).toBeCloseTo(7, 1);
    expect(t.position[2]).toBeCloseTo(5 + 7, 1);
  });

  it("centre mode: camera locks to arena centre regardless of bomber position", () => {
    const world = new World();
    seedScene(world, { bomberAt: [1, 1] });
    const sys = createKaboomCameraFollowSystem({ mode: "centre", smoothing: 1 });
    sys.frameUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("camera.main", "Transform")!;
    expect(t.position[0]).toBeCloseTo(7, 1);
    expect(t.position[2]).toBeCloseTo(5 + 7, 1);
  });

  it("missing target entity → falls back to arena centre", () => {
    const world = new World();
    seedScene(world); // no bomber
    const sys = createKaboomCameraFollowSystem({ smoothing: 1 });
    sys.frameUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("camera.main", "Transform")!;
    expect(t.position[0]).toBeCloseTo(7, 1);
    expect(t.position[2]).toBeCloseTo(5 + 7, 1);
  });

  it("damping (smoothing < 1) approaches target gradually", () => {
    const world = new World();
    seedScene(world, { sizeX: 30, sizeZ: 20, bomberAt: [25, 18] });
    world.setComponent("camera.main", "Transform", { position: [0, 10, 0], rotation: [-55, 0, 0], scale: [1, 1, 1] });
    const sys = createKaboomCameraFollowSystem({ smoothing: 0.18 });
    sys.frameUpdate!(ctx(world));
    const after1 = world.getComponent<{ position: ReadonlyArray<number> }>("camera.main", "Transform")!;
    // After one frame with smoothing 0.18 we should NOT be all the way at target.
    expect(after1.position[0]).toBeGreaterThan(0);
    expect(after1.position[0]).toBeLessThan(25);
  });

  it("orthographicSize is updated to the configured viewSize", () => {
    const world = new World();
    seedScene(world, { bomberAt: [5, 5] });
    const sys = createKaboomCameraFollowSystem({ viewSize: 4, smoothing: 1 });
    sys.frameUpdate!(ctx(world));
    const cam = world.getComponent<{ orthographicSize?: number }>("camera.main", "Camera")!;
    expect(cam.orthographicSize).toBe(4);
  });

  it("large arena (30x20) + bomber near corner → camera follows toward the corner", () => {
    const world = new World();
    seedScene(world, { sizeX: 30, sizeZ: 20, bomberAt: [25, 15] });
    const sys = createKaboomCameraFollowSystem({ smoothing: 1, viewSize: 5 });
    sys.frameUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("camera.main", "Transform")!;
    // Camera should move toward (25, _, 15) — clamped by arena bounds.
    expect(t.position[0]).toBeGreaterThan(14);
    expect(t.position[2]).toBeGreaterThan(14);
  });

  it("spectate mode follows the spectateTargetId entity", () => {
    const world = new World();
    seedScene(world, { sizeX: 30, sizeZ: 20, bomberAt: [5, 5] });
    world.addEntity("bot.1");
    world.setComponent("bot.1", "Transform", { position: [25, 0.4, 18], rotation: [0, 0, 0], scale: [1, 1, 1] });
    const sys = createKaboomCameraFollowSystem({ mode: "spectate", spectateTargetId: "bot.1", smoothing: 1, viewSize: 5 });
    sys.frameUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("camera.main", "Transform")!;
    // Camera should move toward bot.1 (25, _, 18), not player.1 (5, _, 5).
    expect(t.position[0]).toBeGreaterThan(15);
    expect(t.position[2]).toBeGreaterThan(15);
  });

  it("default pitch is applied to camera rotation", () => {
    const world = new World();
    seedScene(world, { bomberAt: [5, 5] });
    const sys = createKaboomCameraFollowSystem({ smoothing: 1 });
    sys.frameUpdate!(ctx(world));
    const t = world.getComponent<{ rotation: ReadonlyArray<number> }>("camera.main", "Transform")!;
    expect(t.rotation[0]).toBe(__CAMERA_FOLLOW_CONSTANTS.DEFAULT_PITCH_DEG);
  });
});
