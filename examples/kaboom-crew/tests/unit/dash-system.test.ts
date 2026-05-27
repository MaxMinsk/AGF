// S159 KABOOM-DASH unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  __DASH_CONSTANTS,
  createKaboomDashSystem,
  dashArcPosition,
  resolveDashTarget
} from "../../src/systems/dash-system";

const FIXED_DT = 1 / 60;

function ctx(world: World, fixedDt = FIXED_DT) {
  return { world, time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 } };
}

function addBomber(world: World, id: string, gx: number, gz: number, alive = true): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.4, gz], rotation: [0, 0, 0], scale: [0.4, 0.4, 0.4] });
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive });
}

function addHardWall(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "block", blocksMovement: true, blocksBlast: true });
}

function ensureGrid(world: World): void {
  world.addEntity("grid.config");
  world.setComponent("grid.config", "Grid", { sizeX: 15, sizeZ: 11 });
}

describe("dashArcPosition (S159 pure helper)", () => {
  it("returns start at elapsed=0 + y == baseY", () => {
    const [x, y, z] = dashArcPosition(5, 5, 7, 5, 0, 0.4);
    expect(x).toBe(5);
    expect(z).toBe(5);
    expect(y).toBeCloseTo(0.4, 5);
  });
  it("returns target at elapsed=duration + y == baseY", () => {
    const [x, y, z] = dashArcPosition(5, 5, 7, 5, __DASH_CONSTANTS.DASH_DURATION_MS, 0.4);
    expect(x).toBe(7);
    expect(z).toBe(5);
    expect(y).toBeCloseTo(0.4, 5);
  });
  it("peaks at midpoint (y == baseY + DASH_ARC_PEAK_Y)", () => {
    const [, y] = dashArcPosition(5, 5, 7, 5, __DASH_CONSTANTS.DASH_DURATION_MS / 2, 0.4);
    expect(y).toBeCloseTo(0.4 + 0.5, 5);
  });
  it("clamps elapsed outside [0, duration]", () => {
    const [, y1] = dashArcPosition(5, 5, 7, 5, -10, 0.4);
    expect(y1).toBe(0.4);
    const [, y2] = dashArcPosition(5, 5, 7, 5, 9999, 0.4);
    expect(y2).toBe(0.4);
  });
});

describe("resolveDashTarget (S159 pure helper)", () => {
  const empty = (): string => "empty";
  it("2-cell dash through empty cells lands at +2", () => {
    expect(resolveDashTarget(5, 5, 1, 0, empty)).toEqual({ gx: 7, gz: 5 });
  });
  it("hard-wall at second cell → falls back to +1", () => {
    const cellAt = (gx: number, _gz: number): string => (gx === 7 ? "hard-wall" : "empty");
    expect(resolveDashTarget(5, 5, 1, 0, cellAt)).toEqual({ gx: 6, gz: 5 });
  });
  it("hard-wall at first cell → undefined (refuse dash, no cooldown burn)", () => {
    const cellAt = (gx: number, _gz: number): string => (gx === 6 ? "hard-wall" : "empty");
    expect(resolveDashTarget(5, 5, 1, 0, cellAt)).toBeUndefined();
  });
  it("out-of-bounds at first cell → undefined", () => {
    const cellAt = (): string => "out-of-bounds";
    expect(resolveDashTarget(0, 0, -1, 0, cellAt)).toBeUndefined();
  });
  it("soft block (cellAt returns 'empty' for non-hard) → dash passes through", () => {
    // Caller is responsible for filtering soft blocks out of the
    // 'hard-wall' classification.
    expect(resolveDashTarget(5, 5, 1, 0, empty)).toEqual({ gx: 7, gz: 5 });
  });
});

describe("createKaboomDashSystem (S159)", () => {
  it("DashRequest with clear path → initiates dash + sets cooldown + clears request", () => {
    const world = new World();
    ensureGrid(world);
    addBomber(world, "player.1", 5, 5);
    world.setComponent("player.1", "DashRequest", { dx: 1, dz: 0 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    const stats = world.getComponent<{ dashing: boolean; dashCooldownRemainingMs: number; dashTargetGx: number }>("player.1", "BomberStats")!;
    expect(stats.dashing).toBe(true);
    expect(stats.dashCooldownRemainingMs).toBe(__DASH_CONSTANTS.DASH_COOLDOWN_MS);
    expect(stats.dashTargetGx).toBe(7);
    expect(world.hasComponent("player.1", "DashRequest")).toBe(false);
  });

  it("dead bomber's DashRequest is consumed without state change", () => {
    const world = new World();
    ensureGrid(world);
    addBomber(world, "player.1", 5, 5, false);
    world.setComponent("player.1", "DashRequest", { dx: 1, dz: 0 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    const stats = world.getComponent<{ dashing?: boolean }>("player.1", "BomberStats")!;
    expect(stats.dashing).toBeUndefined();
    expect(world.hasComponent("player.1", "DashRequest")).toBe(false);
  });

  it("cooldown > 0 — request silently dropped, no dash + no cooldown reset", () => {
    const world = new World();
    ensureGrid(world);
    addBomber(world, "player.1", 5, 5);
    const orig = world.getComponent<Record<string, unknown>>("player.1", "BomberStats")!;
    world.setComponent("player.1", "BomberStats", { ...orig, dashCooldownRemainingMs: 1000 });
    world.setComponent("player.1", "DashRequest", { dx: 1, dz: 0 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    const stats = world.getComponent<{ dashing?: boolean; dashCooldownRemainingMs: number }>("player.1", "BomberStats")!;
    expect(stats.dashing).not.toBe(true);
    // Cooldown ticked down by one frame's dt.
    expect(stats.dashCooldownRemainingMs).toBeLessThan(1000);
    expect(stats.dashCooldownRemainingMs).toBeGreaterThan(900);
  });

  it("hard-wall blocking the WHOLE path → refused (no cooldown burn)", () => {
    const world = new World();
    ensureGrid(world);
    addBomber(world, "player.1", 5, 5);
    addHardWall(world, "wall.east", 6, 5);
    world.setComponent("player.1", "DashRequest", { dx: 1, dz: 0 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    const stats = world.getComponent<{ dashing?: boolean; dashCooldownRemainingMs?: number }>("player.1", "BomberStats")!;
    expect(stats.dashing).not.toBe(true);
    expect(stats.dashCooldownRemainingMs ?? 0).toBe(0);
  });

  it("hard-wall at +2 → falls back to +1 single-cell dash", () => {
    const world = new World();
    ensureGrid(world);
    addBomber(world, "player.1", 5, 5);
    addHardWall(world, "wall.east", 7, 5);
    world.setComponent("player.1", "DashRequest", { dx: 1, dz: 0 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    const stats = world.getComponent<{ dashing: boolean; dashTargetGx: number }>("player.1", "BomberStats")!;
    expect(stats.dashing).toBe(true);
    expect(stats.dashTargetGx).toBe(6);
  });

  it("after DASH_DURATION_MS, bomber lands at target cell + dashing=false + GridPosition snaps", () => {
    const world = new World();
    ensureGrid(world);
    addBomber(world, "player.1", 5, 5);
    world.setComponent("player.1", "DashRequest", { dx: 1, dz: 0 });
    const sys = createKaboomDashSystem();
    // 1 tick to initiate, then enough ticks to cover 200ms.
    sys.fixedUpdate!(ctx(world));
    for (let i = 0; i < 14; i += 1) sys.fixedUpdate!(ctx(world));
    const stats = world.getComponent<{ dashing: boolean }>("player.1", "BomberStats")!;
    const pos = world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!;
    expect(stats.dashing).toBe(false);
    expect(pos.gx).toBe(7);
    expect(pos.gz).toBe(5);
  });

  it("cooldown decrements each tick + reaches 0 after ~3s", () => {
    const world = new World();
    ensureGrid(world);
    addBomber(world, "player.1", 5, 5);
    world.setComponent("player.1", "DashRequest", { dx: 1, dz: 0 });
    const sys = createKaboomDashSystem();
    sys.fixedUpdate!(ctx(world));
    // 200 ticks at 1/60 ≈ 3.33 s — past the 3 s cooldown.
    for (let i = 0; i < 200; i += 1) sys.fixedUpdate!(ctx(world));
    const stats = world.getComponent<{ dashCooldownRemainingMs: number }>("player.1", "BomberStats")!;
    expect(stats.dashCooldownRemainingMs).toBe(0);
  });
});
