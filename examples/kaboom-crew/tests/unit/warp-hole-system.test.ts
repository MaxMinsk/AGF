// S149 KABOOM-WARP-HOLE — unit tests for the new arena module.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { createKaboomWarpHoleSystem } from "../../src/systems/warp-hole-system";

const FIXED_DT = 1 / 60;

function ctx(world: World, fixedDt = FIXED_DT) {
  return { world, time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 } };
}

function addWarp(world: World, id: string, gx: number, gz: number, pairId: number, role: "a" | "b"): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.06, gz], rotation: [0, 0, 0], scale: [0.9, 0.05, 0.9] });
  world.setComponent(id, "WarpHole", { pairId, role });
}

function addBomber(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.4, gz], rotation: [0, 0, 0], scale: [0.4, 0.4, 0.4] });
  world.setComponent(id, "GridOccupant", { layer: id, blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive: true });
  world.setComponent(id, "GridMover", { speed: 4 });
}

function addBomb(world: World, id: string, gx: number, gz: number, fuse = 2.0): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.35, gz], rotation: [0, 0, 0], scale: [0.35, 0.35, 0.35] });
  world.setComponent(id, "GridOccupant", { layer: "bomb", blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "Bomb", { fuseRemaining: fuse, range: 2, ownerId: "player.1" });
}

function tick(world: World, occ: ReturnType<typeof createGridOccupancySystem>, sys: ReturnType<typeof createKaboomWarpHoleSystem>, n = 1): void {
  for (let i = 0; i < n; i += 1) {
    occ.frameUpdate!(ctx(world));
    sys.fixedUpdate!(ctx(world));
  }
}

describe("createKaboomWarpHoleSystem (S149)", () => {
  it("bomber on warp cell A teleports to cell B in one fixedUpdate", () => {
    const world = new World();
    addWarp(world, "warp.0.a", 2, 1, 0, "a");
    addWarp(world, "warp.0.b", 12, 9, 0, "b");
    addBomber(world, "player.1", 2, 1);
    const occ = createGridOccupancySystem();
    const sys = createKaboomWarpHoleSystem({ occupancy: occ });
    tick(world, occ, sys);
    const pos = world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!;
    expect(pos.gx).toBe(12);
    expect(pos.gz).toBe(9);
  });

  it("bomber on cell B teleports to cell A (symmetric warp)", () => {
    const world = new World();
    addWarp(world, "warp.0.a", 2, 1, 0, "a");
    addWarp(world, "warp.0.b", 12, 9, 0, "b");
    addBomber(world, "player.1", 12, 9);
    const occ = createGridOccupancySystem();
    const sys = createKaboomWarpHoleSystem({ occupancy: occ });
    tick(world, occ, sys);
    const pos = world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!;
    expect(pos.gx).toBe(2);
    expect(pos.gz).toBe(1);
  });

  it("bomb with positive fuse warps normally; fuseRemaining unchanged", () => {
    const world = new World();
    addWarp(world, "warp.0.a", 5, 5, 0, "a");
    addWarp(world, "warp.0.b", 9, 5, 0, "b");
    addBomb(world, "bomb.a", 5, 5, 1.5);
    const occ = createGridOccupancySystem();
    const sys = createKaboomWarpHoleSystem({ occupancy: occ });
    tick(world, occ, sys);
    const pos = world.getComponent<{ gx: number; gz: number }>("bomb.a", "GridPosition")!;
    const bomb = world.getComponent<{ fuseRemaining: number }>("bomb.a", "Bomb")!;
    expect(pos.gx).toBe(9);
    expect(pos.gz).toBe(5);
    expect(bomb.fuseRemaining).toBe(1.5);
  });

  it("bomb mid-detonation (fuseRemaining=0) does NOT warp", () => {
    const world = new World();
    addWarp(world, "warp.0.a", 5, 5, 0, "a");
    addWarp(world, "warp.0.b", 9, 5, 0, "b");
    addBomb(world, "bomb.a", 5, 5, 0);
    const occ = createGridOccupancySystem();
    const sys = createKaboomWarpHoleSystem({ occupancy: occ });
    tick(world, occ, sys);
    const pos = world.getComponent<{ gx: number; gz: number }>("bomb.a", "GridPosition")!;
    expect(pos.gx).toBe(5); // unchanged
  });

  // QA-2026-05-27-001 regression — the per-entity tracking replaces the
  // earlier broken per-pair cooldown. A bomber that stays on the
  // destination cell DOES NOT get ping-ponged back to the source.
  it("QA-2026-05-27-001 regression — stationary bomber on warp DOES NOT ping-pong", () => {
    const world = new World();
    addWarp(world, "warp.0.a", 2, 1, 0, "a");
    addWarp(world, "warp.0.b", 12, 9, 0, "b");
    addBomber(world, "player.1", 2, 1);
    const occ = createGridOccupancySystem();
    const sys = createKaboomWarpHoleSystem({ occupancy: occ });
    // First tick warps A → B. Player stays put for 60 more ticks
    // (~1 second). Should remain at B; no return to A.
    tick(world, occ, sys);
    expect(world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!.gx).toBe(12);
    tick(world, occ, sys, 60);
    const pos = world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!;
    expect(pos.gx).toBe(12);
    expect(pos.gz).toBe(9);
  });

  it("per-entity model — walking off destination then back onto a warp re-fires", () => {
    // Walk in → warp to B → step away (set pos to a non-warp cell) →
    // step back onto a warp cell → should warp again.
    const world = new World();
    addWarp(world, "warp.0.a", 2, 1, 0, "a");
    addWarp(world, "warp.0.b", 12, 9, 0, "b");
    addBomber(world, "player.1", 2, 1);
    const occ = createGridOccupancySystem();
    const sys = createKaboomWarpHoleSystem({ occupancy: occ });
    tick(world, occ, sys);
    expect(world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!.gx).toBe(12);
    // Walk to a non-warp cell first — clears the per-entity stamp.
    world.setComponent("player.1", "GridPosition", { gx: 11, gz: 9 });
    tick(world, occ, sys);
    // Now step BACK onto a warp cell. Eligible again — warps.
    world.setComponent("player.1", "GridPosition", { gx: 12, gz: 9 });
    tick(world, occ, sys);
    const pos = world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!;
    expect(pos.gx).toBe(2);
    expect(pos.gz).toBe(1);
  });

  it("two warp pairs run independently — pair-0 cooldown doesn't affect pair-1", () => {
    const world = new World();
    addWarp(world, "warp.0.a", 2, 1, 0, "a");
    addWarp(world, "warp.0.b", 12, 9, 0, "b");
    addWarp(world, "warp.1.a", 5, 5, 1, "a");
    addWarp(world, "warp.1.b", 9, 5, 1, "b");
    addBomber(world, "player.1", 2, 1);
    addBomber(world, "player.2", 5, 5);
    const occ = createGridOccupancySystem();
    const sys = createKaboomWarpHoleSystem({ occupancy: occ });
    tick(world, occ, sys);
    expect(world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!.gx).toBe(12);
    expect(world.getComponent<{ gx: number; gz: number }>("player.2", "GridPosition")!.gx).toBe(9);
  });

  it("dead bomber on warp cell is NOT teleported", () => {
    const world = new World();
    addWarp(world, "warp.0.a", 2, 1, 0, "a");
    addWarp(world, "warp.0.b", 12, 9, 0, "b");
    addBomber(world, "player.1", 2, 1);
    world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: false });
    const occ = createGridOccupancySystem();
    const sys = createKaboomWarpHoleSystem({ occupancy: occ });
    tick(world, occ, sys);
    const pos = world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!;
    expect(pos.gx).toBe(2); // unchanged
  });

  it("warp preserves Transform.y so the bomber doesn't sink/fly", () => {
    const world = new World();
    addWarp(world, "warp.0.a", 2, 1, 0, "a");
    addWarp(world, "warp.0.b", 12, 9, 0, "b");
    addBomber(world, "player.1", 2, 1);
    const transformBefore = world.getComponent<{ position: number[] }>("player.1", "Transform")!;
    const yBefore = transformBefore.position[1]!;
    const occ = createGridOccupancySystem();
    const sys = createKaboomWarpHoleSystem({ occupancy: occ });
    tick(world, occ, sys);
    const transformAfter = world.getComponent<{ position: number[] }>("player.1", "Transform")!;
    expect(transformAfter.position[1]).toBe(yBefore);
    expect(transformAfter.position[0]).toBe(12);
    expect(transformAfter.position[2]).toBe(9);
  });

  it("warping resets GridMover.queuedDirection so the bomber doesn't immediately slide back", () => {
    const world = new World();
    addWarp(world, "warp.0.a", 2, 1, 0, "a");
    addWarp(world, "warp.0.b", 12, 9, 0, "b");
    addBomber(world, "player.1", 2, 1);
    world.setComponent("player.1", "GridMover", { speed: 4, queuedDirection: { dx: 1, dz: 0 }, currentLerp: 0.3 });
    const occ = createGridOccupancySystem();
    const sys = createKaboomWarpHoleSystem({ occupancy: occ });
    tick(world, occ, sys);
    const mover = world.getComponent<{ queuedDirection: { dx: number; dz: number }; currentLerp: number }>("player.1", "GridMover")!;
    expect(mover.queuedDirection.dx).toBe(0);
    expect(mover.queuedDirection.dz).toBe(0);
    expect(mover.currentLerp).toBe(0);
  });

  it("warpfield.scene.json has 3 well-formed pairs", async () => {
    const sceneModule = await import("../../scenes/warpfield.scene.json");
    const scene = (sceneModule as unknown as { default: { entities: Array<{ id: string; components: Record<string, unknown> }> } }).default;
    const warpEntities = scene.entities.filter((e) => e.components["WarpHole"] !== undefined);
    expect(warpEntities.length).toBe(6); // 3 pairs × 2 ends
    const pairs = new Map<number, { a: boolean; b: boolean }>();
    for (const w of warpEntities) {
      const c = w.components["WarpHole"] as { pairId: number; role: "a" | "b" };
      const entry = pairs.get(c.pairId) ?? { a: false, b: false };
      entry[c.role] = true;
      pairs.set(c.pairId, entry);
    }
    expect(pairs.size).toBe(3);
    for (const [, entry] of pairs) {
      expect(entry.a).toBe(true);
      expect(entry.b).toBe(true);
    }
  });
});
