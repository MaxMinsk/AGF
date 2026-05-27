// S160 KABOOM-SUDDEN-DEATH unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  __SUDDEN_DEATH_CONSTANTS,
  createKaboomSuddenDeathSystem,
  ringCells
} from "../../src/systems/sudden-death-system";

const FIXED_DT = 1 / 60;
function ctx(world: World, fixedDt = FIXED_DT) {
  return { world, time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 } };
}

function seed(world: World, opts: { sizeX?: number; sizeZ?: number; triggerAt?: number; ringInterval?: number; enabled?: boolean; elapsed?: number } = {}): void {
  world.addEntity("grid.config");
  world.setComponent("grid.config", "Grid", { sizeX: opts.sizeX ?? 7, sizeZ: opts.sizeZ ?? 7 });
  world.addEntity("kaboom.round-state");
  world.setComponent("kaboom.round-state", "RoundState", { phase: "playing", elapsed: opts.elapsed ?? 0 });
  world.addEntity("kaboom.game-state");
  world.setComponent("kaboom.game-state", "SuddenDeathConfig", {
    enabled: opts.enabled ?? true,
    triggerAtElapsedS: opts.triggerAt ?? 60,
    ringIntervalS: opts.ringInterval ?? 2,
    ringWidth: 1
  });
}

function setElapsed(world: World, elapsed: number): void {
  const r = world.getComponent<{ phase: string; elapsed: number }>("kaboom.round-state", "RoundState")!;
  world.setComponent("kaboom.round-state", "RoundState", { ...r, elapsed });
}

describe("ringCells (S160 pure helper)", () => {
  it("depth 0 on a 5x5 = 16 perimeter cells", () => {
    expect(ringCells(5, 5, 0)).toHaveLength(16);
  });
  it("depth 1 on a 5x5 = 8 inner-ring cells", () => {
    expect(ringCells(5, 5, 1)).toHaveLength(8);
  });
  it("depth 2 on a 5x5 = 1 cell (centre)", () => {
    expect(ringCells(5, 5, 2)).toEqual([{ gx: 2, gz: 2 }]);
  });
  it("depth >= half on a 5x5 = empty", () => {
    expect(ringCells(5, 5, 3)).toEqual([]);
  });
  it("rectangular grid 7x3 depth 0 = full perimeter", () => {
    expect(ringCells(7, 3, 0)).toHaveLength(2 * 7 + (3 - 2) * 2);
  });
});

describe("createKaboomSuddenDeathSystem (S160)", () => {
  it("does NOT trigger before triggerAtElapsedS", () => {
    const world = new World();
    seed(world, { triggerAt: 60, elapsed: 59 });
    const sys = createKaboomSuddenDeathSystem();
    sys.fixedUpdate!(ctx(world));
    const state = world.getComponent("kaboom.game-state", "SuddenDeathState");
    expect(state).toBeUndefined();
  });

  it("activates the first tick elapsed crosses triggerAtElapsedS", () => {
    const world = new World();
    seed(world, { triggerAt: 60, elapsed: 60 });
    const sys = createKaboomSuddenDeathSystem();
    sys.fixedUpdate!(ctx(world));
    const state = world.getComponent<{ activated: boolean; activatedAt: number; ringsSpawned: number }>("kaboom.game-state", "SuddenDeathState")!;
    expect(state.activated).toBe(true);
    // S160 — activatedAt anchored to triggerAt (not actual elapsed)
    // so a lag-spike past trigger doesn't drift the schedule.
    expect(state.activatedAt).toBe(60);
    expect(state.ringsSpawned).toBeGreaterThanOrEqual(1);
  });

  it("spawns one ring on activation tick then no more until ringIntervalS elapsed", () => {
    const world = new World();
    seed(world, { triggerAt: 60, elapsed: 60, ringInterval: 2, sizeX: 7, sizeZ: 7 });
    const sys = createKaboomSuddenDeathSystem();
    sys.fixedUpdate!(ctx(world));
    const after1 = world.getComponent<{ ringsSpawned: number }>("kaboom.game-state", "SuddenDeathState")!;
    expect(after1.ringsSpawned).toBe(1);
    setElapsed(world, 61);
    sys.fixedUpdate!(ctx(world));
    const after2 = world.getComponent<{ ringsSpawned: number }>("kaboom.game-state", "SuddenDeathState")!;
    expect(after2.ringsSpawned).toBe(1);
    setElapsed(world, 62);
    sys.fixedUpdate!(ctx(world));
    const after3 = world.getComponent<{ ringsSpawned: number }>("kaboom.game-state", "SuddenDeathState")!;
    expect(after3.ringsSpawned).toBe(2);
  });

  it("bomber on a sealed cell flips alive=false", () => {
    const world = new World();
    seed(world, { triggerAt: 60, elapsed: 60, sizeX: 5, sizeZ: 5 });
    world.addEntity("player.1");
    world.setComponent("player.1", "GridPosition", { gx: 0, gz: 0 }); // corner = perimeter ring
    world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: true });
    const sys = createKaboomSuddenDeathSystem();
    sys.fixedUpdate!(ctx(world));
    const stats = world.getComponent<{ alive?: boolean }>("player.1", "BomberStats")!;
    expect(stats.alive).toBe(false);
  });

  it("bomb on a sealed cell is removed", () => {
    const world = new World();
    seed(world, { triggerAt: 60, elapsed: 60, sizeX: 5, sizeZ: 5 });
    world.addEntity("bomb.1");
    world.setComponent("bomb.1", "GridPosition", { gx: 0, gz: 0 });
    world.setComponent("bomb.1", "Bomb", { ownerId: "player.1", remainingMs: 2000 });
    const sys = createKaboomSuddenDeathSystem();
    sys.fixedUpdate!(ctx(world));
    expect(world.hasEntity("bomb.1")).toBe(false);
  });

  it("pickup on a sealed cell is removed", () => {
    const world = new World();
    seed(world, { triggerAt: 60, elapsed: 60, sizeX: 5, sizeZ: 5 });
    world.addEntity("pickup.0.0");
    world.setComponent("pickup.0.0", "GridPosition", { gx: 0, gz: 0 });
    world.setComponent("pickup.0.0", "Pickup", { kind: "bomb-up" });
    const sys = createKaboomSuddenDeathSystem();
    sys.fixedUpdate!(ctx(world));
    expect(world.hasEntity("pickup.0.0")).toBe(false);
  });

  it("spawned ring blocks have SuddenDeathBlock + GridOccupant(wall)", () => {
    const world = new World();
    seed(world, { triggerAt: 60, elapsed: 60, sizeX: 5, sizeZ: 5 });
    const sys = createKaboomSuddenDeathSystem();
    sys.fixedUpdate!(ctx(world));
    let count = 0;
    for (const id of world.entityIds()) {
      if (world.hasComponent(id, "SuddenDeathBlock")) {
        const occ = world.getComponent<{ layer?: string; blocksMovement?: boolean; blocksBlast?: boolean }>(id, "GridOccupant")!;
        expect(occ.layer).toBe("wall");
        expect(occ.blocksMovement).toBe(true);
        expect(occ.blocksBlast).toBe(true);
        count += 1;
      }
    }
    expect(count).toBeGreaterThan(0);
  });

  it("MeshRenderer.color is the imminent-danger red", () => {
    const world = new World();
    seed(world, { triggerAt: 60, elapsed: 60, sizeX: 5, sizeZ: 5 });
    const sys = createKaboomSuddenDeathSystem();
    sys.fixedUpdate!(ctx(world));
    for (const id of world.entityIds()) {
      if (!world.hasComponent(id, "SuddenDeathBlock")) continue;
      const mr = world.getComponent<{ color?: string }>(id, "MeshRenderer")!;
      expect(mr.color).toBe(__SUDDEN_DEATH_CONSTANTS.SUDDEN_DEATH_BLOCK_COLOR);
      break;
    }
  });

  it("enabled=false disables the system entirely", () => {
    const world = new World();
    seed(world, { triggerAt: 60, elapsed: 90, enabled: false });
    const sys = createKaboomSuddenDeathSystem();
    sys.fixedUpdate!(ctx(world));
    const state = world.getComponent("kaboom.game-state", "SuddenDeathState");
    expect(state).toBeUndefined();
    const anySdBlock = [...world.entityIds()].some((id) => world.hasComponent(id, "SuddenDeathBlock"));
    expect(anySdBlock).toBe(false);
  });

  it("does not run while round phase != playing", () => {
    const world = new World();
    seed(world, { triggerAt: 60, elapsed: 90 });
    world.setComponent("kaboom.round-state", "RoundState", { phase: "won", elapsed: 90 });
    const sys = createKaboomSuddenDeathSystem();
    sys.fixedUpdate!(ctx(world));
    const state = world.getComponent("kaboom.game-state", "SuddenDeathState");
    expect(state).toBeUndefined();
  });

  it("multiple ring intervals on one tick fills the gap (e.g. lag spike)", () => {
    const world = new World();
    seed(world, { triggerAt: 60, elapsed: 66, ringInterval: 2, sizeX: 7, sizeZ: 7 });
    const sys = createKaboomSuddenDeathSystem();
    sys.fixedUpdate!(ctx(world));
    const state = world.getComponent<{ ringsSpawned: number }>("kaboom.game-state", "SuddenDeathState")!;
    // elapsedSinceTrigger = 6, floor(6/2)+1 = 4 rings.
    expect(state.ringsSpawned).toBe(4);
  });
});
