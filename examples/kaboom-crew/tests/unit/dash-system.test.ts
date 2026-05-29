// S198 KABOOM-DASH-SPEED-BURST unit tests. Replaces the S159 arc-and-
// teleport tests after the refactor to a temporary GridMover.speed
// multiplier.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  __DASH_CONSTANTS,
  createKaboomDashSystem
} from "../../src/systems/dash-system";

const FIXED_DT = 1 / 60;

function ctx(world: World, fixedDt = FIXED_DT) {
  return {
    world,
    time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomber(world: World, id: string, gx: number, gz: number, alive = true): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", {
    position: [gx, 0.4, gz],
    rotation: [0, 0, 0],
    scale: [0.4, 0.4, 0.4]
  });
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive });
  world.setComponent(id, "GridMover", { speed: 4, currentLerp: 0 });
}

function speed(world: World, id: string): number {
  return world.getComponent<{ speed?: number }>(id, "GridMover")?.speed ?? 0;
}

function stats(world: World, id: string): {
  dashing?: boolean;
  dashCooldownRemainingMs?: number;
  dashElapsedMs?: number;
  dashBaseSpeed?: number;
} {
  return (world.getComponent(id, "BomberStats") ?? {}) as never;
}

describe("kaboom dash speed burst (S198)", () => {
  it("DashRequest fires the burst: dashing=true, speed multiplied, baseline captured", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5);
    world.setComponent("player.1", "DashRequest", { dx: 1, dz: 0 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    expect(stats(world, "player.1").dashing).toBe(true);
    expect(stats(world, "player.1").dashBaseSpeed).toBe(4);
    expect(speed(world, "player.1")).toBe(4 * __DASH_CONSTANTS.DASH_SPEED_MULTIPLIER);
    expect(stats(world, "player.1").dashCooldownRemainingMs).toBe(__DASH_CONSTANTS.DASH_COOLDOWN_MS);
    expect(world.hasComponent("player.1", "DashRequest")).toBe(false);
  });

  it("burst window expiry restores the baseline speed + clears dashing", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5);
    world.setComponent("player.1", "DashRequest", { dx: 1, dz: 0 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    // 240ms / (1/60 s) ≈ 15 ticks; run a few extra to settle.
    for (let i = 0; i < 20; i += 1) sys.fixedUpdate!(ctx(world));
    expect(stats(world, "player.1").dashing).toBe(false);
    expect(speed(world, "player.1")).toBe(4);
  });

  it("cooldown ticks down each fixedUpdate after the burst clears", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5);
    world.setComponent("player.1", "DashRequest", { dx: 1, dz: 0 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    for (let i = 0; i < 30; i += 1) sys.fixedUpdate!(ctx(world));
    const cdMid = stats(world, "player.1").dashCooldownRemainingMs ?? 0;
    expect(cdMid).toBeLessThan(__DASH_CONSTANTS.DASH_COOLDOWN_MS);
    expect(cdMid).toBeGreaterThan(0);
  });

  it("dash refused while on cooldown: dashing stays false, speed stays baseline", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5);
    world.setComponent("player.1", "BomberStats", {
      maxBombs: 1,
      range: 2,
      alive: true,
      dashCooldownRemainingMs: 1500
    });
    world.setComponent("player.1", "DashRequest", { dx: 1, dz: 0 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    expect(stats(world, "player.1").dashing).toBeUndefined();
    expect(speed(world, "player.1")).toBe(4);
    expect(world.hasComponent("player.1", "DashRequest")).toBe(false);
  });

  it("dead bomber's DashRequest is consumed without state change", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, false);
    world.setComponent("player.1", "DashRequest", { dx: 1, dz: 0 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    expect(stats(world, "player.1").dashing).toBeUndefined();
    expect(world.hasComponent("player.1", "DashRequest")).toBe(false);
  });

  it("(dx=0, dz=0) request is consumed without firing a burst", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5);
    world.setComponent("player.1", "DashRequest", { dx: 0, dz: 0 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    expect(stats(world, "player.1").dashing).toBeUndefined();
    expect(world.hasComponent("player.1", "DashRequest")).toBe(false);
  });

  it("diagonal request (dx=1, dz=1) is rejected", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5);
    world.setComponent("player.1", "DashRequest", { dx: 1, dz: 1 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    expect(stats(world, "player.1").dashing).toBeUndefined();
  });

  it("burst writes queuedDirection so the bomber commits to the dash direction", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5);
    world.setComponent("player.1", "DashRequest", { dx: 0, dz: -1 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    const mover = world.getComponent<{ queuedDirection?: { dx: number; dz: number } }>(
      "player.1",
      "GridMover"
    );
    expect(mover?.queuedDirection).toEqual({ dx: 0, dz: -1 });
  });
});
