// S261 KABOOM-RANDOM-LAYOUT — unit tests for the soft-block shuffle
// system's pure helpers + the end-to-end relocate loop.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import type { GridConfig } from "../../../../engine/core/grid";
import {
  collectPassableCells,
  createKaboomSoftBlockShuffleSystem,
  pickShuffledSoftBlockCells
} from "../../src/systems/soft-block-shuffle-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function makeGrid(world: World, width: number, height: number): GridConfig {
  const id = "kaboom.grid-config";
  world.addEntity(id);
  const grid: GridConfig = { sizeX: width, sizeZ: height, cellSize: 1 };
  world.setComponent(id, "Grid", grid);
  return grid;
}

function addHardBlock(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "wall", blocksMovement: true, blocksBlast: true });
}

function addSoftBlock(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.5, gz], rotation: [0, 0, 0], scale: [0.9, 0.9, 0.9] });
  world.setComponent(id, "GridOccupant", { layer: "block", blocksMovement: true, blocksBlast: false });
  world.setComponent(id, "MeshRenderer", { mesh: "box", color: "#c98a4e" });
}

function addBomber(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, activeBombs: 0, alive: true });
}

describe("collectPassableCells (S261 helper)", () => {
  it("excludes hard cells + spawn-exclusion zones", () => {
    const grid: GridConfig = { sizeX: 6, sizeZ: 6, cellSize: 1 };
    const hard = new Set(["2,2", "3,3"]);
    const spawns = [{ gx: 0, gz: 0 }];
    const passable = collectPassableCells(grid, hard, spawns, 1);
    // Chebyshev radius 1 from (0,0) — the 3×3 corner [0..1]×[0..1] is
    // excluded (bomber + L-exit).
    expect(passable.some((c) => c.gx === 0 && c.gz === 0)).toBe(false);
    expect(passable.some((c) => c.gx === 1 && c.gz === 0)).toBe(false);
    expect(passable.some((c) => c.gx === 0 && c.gz === 1)).toBe(false);
    expect(passable.some((c) => c.gx === 1 && c.gz === 1)).toBe(false);
    // hard cells out.
    expect(passable.some((c) => c.gx === 2 && c.gz === 2)).toBe(false);
    expect(passable.some((c) => c.gx === 3 && c.gz === 3)).toBe(false);
    // (2,0) IS in — Chebyshev distance from (0,0) is 2 > radius 1.
    expect(passable.some((c) => c.gx === 2 && c.gz === 0)).toBe(true);
  });

  it("radius 0 only blocks the spawn cells themselves", () => {
    const grid: GridConfig = { sizeX: 3, sizeZ: 3, cellSize: 1 };
    const passable = collectPassableCells(grid, new Set(), [{ gx: 1, gz: 1 }], 0);
    expect(passable.find((c) => c.gx === 1 && c.gz === 1)).toBeUndefined();
    expect(passable.length).toBe(8); // 9 cells - 1 spawn cell
  });
});

describe("pickShuffledSoftBlockCells (S261 helper)", () => {
  it("returns up to `count` unique cells", () => {
    const pool = [
      { gx: 0, gz: 0 },
      { gx: 1, gz: 0 },
      { gx: 0, gz: 1 },
      { gx: 1, gz: 1 }
    ];
    const result = pickShuffledSoftBlockCells(pool, 3, 42);
    expect(result.length).toBe(3);
    const seen = new Set(result.map((c) => `${c.gx},${c.gz}`));
    expect(seen.size).toBe(3);
  });

  it("is deterministic per seed", () => {
    const pool = [];
    for (let i = 0; i < 20; i += 1) pool.push({ gx: i, gz: 0 });
    const a = pickShuffledSoftBlockCells(pool, 10, 123);
    const b = pickShuffledSoftBlockCells(pool, 10, 123);
    expect(a).toEqual(b);
  });

  it("different seeds → different layouts (usually)", () => {
    const pool = [];
    for (let i = 0; i < 20; i += 1) pool.push({ gx: i, gz: 0 });
    const a = pickShuffledSoftBlockCells(pool, 10, 1);
    const b = pickShuffledSoftBlockCells(pool, 10, 2);
    // Statistically should differ on at least one index. Pin loose:
    // if all 10 match, the seed isn't differentiating — fail loudly.
    let same = 0;
    for (let i = 0; i < 10; i += 1) {
      if (a[i]!.gx === b[i]!.gx && a[i]!.gz === b[i]!.gz) same += 1;
    }
    expect(same).toBeLessThan(10);
  });

  it("count > pool.length returns pool.length elements", () => {
    const pool = [
      { gx: 0, gz: 0 },
      { gx: 1, gz: 0 }
    ];
    const result = pickShuffledSoftBlockCells(pool, 5, 7);
    expect(result.length).toBe(2);
  });

  it("returns empty when pool is empty", () => {
    expect(pickShuffledSoftBlockCells([], 5, 1)).toEqual([]);
  });
});

describe("createKaboomSoftBlockShuffleSystem (S261 end-to-end)", () => {
  it("no-op when disabled", () => {
    const world = new World();
    makeGrid(world, 5, 5);
    addBomber(world, "player.1", 1, 1);
    addSoftBlock(world, "soft-block.1", 3, 3);
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", { roundNumber: 1, phase: "playing" });
    const sys = createKaboomSoftBlockShuffleSystem({ enabled: false });
    sys.fixedUpdate!(ctx(world));
    const gp = world.getComponent<{ gx: number; gz: number }>("soft-block.1", "GridPosition")!;
    expect(gp).toEqual({ gx: 3, gz: 3 });
  });

  it("repositions soft blocks on round start; same set across ticks of the same round", () => {
    const world = new World();
    makeGrid(world, 8, 8);
    addBomber(world, "player.1", 0, 0);
    addSoftBlock(world, "soft-block.1", 3, 3);
    addSoftBlock(world, "soft-block.2", 4, 4);
    addSoftBlock(world, "soft-block.3", 5, 5);
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", { roundNumber: 1, phase: "playing" });
    const sys = createKaboomSoftBlockShuffleSystem({ enabled: true, spawnExclusionRadius: 1 });
    sys.fixedUpdate!(ctx(world));
    const after1 = (id: string) => world.getComponent<{ gx: number; gz: number }>(id, "GridPosition");
    const a1 = after1("soft-block.1");
    const a2 = after1("soft-block.2");
    const a3 = after1("soft-block.3");
    // All three exist; positions changed (with very high probability — different seed).
    expect(a1).toBeDefined();
    expect(a2).toBeDefined();
    expect(a3).toBeDefined();
    // Second tick same round → no further movement (single-fire per round).
    sys.fixedUpdate!(ctx(world));
    expect(after1("soft-block.1")).toEqual(a1);
    expect(after1("soft-block.2")).toEqual(a2);
    expect(after1("soft-block.3")).toEqual(a3);
  });

  it("re-fires when roundNumber advances", () => {
    const world = new World();
    makeGrid(world, 8, 8);
    addBomber(world, "player.1", 0, 0);
    // Place several blocks so different seeds plausibly change at
    // least one position. With 8×8 = 64 cells minus the 3×3 spawn
    // corner (9) the candidate pool is ~55 — plenty of room.
    for (let i = 0; i < 5; i += 1) addSoftBlock(world, `soft-block.${i + 1}`, 3, 3 + i);
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", { roundNumber: 1, phase: "playing" });
    const sys = createKaboomSoftBlockShuffleSystem({ enabled: true, spawnExclusionRadius: 1 });
    sys.fixedUpdate!(ctx(world));
    const r1 = [1, 2, 3, 4, 5].map((i) => world.getComponent<{ gx: number; gz: number }>(`soft-block.${i}`, "GridPosition")!);
    // Round 2 — bump the round number; the system's edge detector
    // should fire shuffle again with a different seed.
    world.setComponent("kaboom.round-state", "RoundState", { roundNumber: 2, phase: "playing" });
    sys.fixedUpdate!(ctx(world));
    const r2 = [1, 2, 3, 4, 5].map((i) => world.getComponent<{ gx: number; gz: number }>(`soft-block.${i}`, "GridPosition")!);
    const sameAll = r1.every((p, i) => p.gx === r2[i]!.gx && p.gz === r2[i]!.gz);
    expect(sameAll).toBe(false);
  });

  it("skips while RoundState.phase isn't 'playing'", () => {
    const world = new World();
    makeGrid(world, 5, 5);
    addBomber(world, "player.1", 0, 0);
    addSoftBlock(world, "soft-block.1", 3, 3);
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", { roundNumber: 1, phase: "won" });
    const sys = createKaboomSoftBlockShuffleSystem({ enabled: true });
    sys.fixedUpdate!(ctx(world));
    expect(world.getComponent("soft-block.1", "GridPosition")).toEqual({ gx: 3, gz: 3 });
  });
});
