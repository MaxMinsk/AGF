// S152 KABOOM-BOMB-BLOCK — unit tests for the classic-Bomberman
// baseline (bombs block bombers) + Bomb Pass override (own bombs are
// passable for bombers with BomberStats.bombPass = true).

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { createKaboomBombBlockSystem } from "../../src/systems/bomb-block-system";

const FIXED_DT = 1 / 60;

function ctx(world: World, fixedDt = FIXED_DT) {
  return { world, time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 } };
}

function addBomber(
  world: World,
  id: string,
  gx: number,
  gz: number,
  direction: { dx: number; dz: number } = { dx: 0, dz: 0 },
  bombPass = false
): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.4, gz], rotation: [0, 0, 0], scale: [0.4, 0.4, 0.4] });
  world.setComponent(id, "GridOccupant", { layer: id, blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive: true, bombPass });
  world.setComponent(id, "GridMover", { speed: 4, queuedDirection: direction });
}

function addBomb(world: World, id: string, gx: number, gz: number, ownerId: string): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.35, gz], rotation: [0, 0, 0], scale: [0.35, 0.35, 0.35] });
  world.setComponent(id, "GridOccupant", { layer: "bomb", blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "Bomb", { fuseRemaining: 2.0, range: 2, ownerId });
}

function step(world: World, occ: ReturnType<typeof createGridOccupancySystem>, sys: ReturnType<typeof createKaboomBombBlockSystem>): void {
  occ.frameUpdate!(ctx(world));
  sys.frameUpdate!(ctx(world));
}

function queuedDirection(world: World, bomberId: string): { dx: number; dz: number } {
  const m = world.getComponent<{ queuedDirection?: { dx: number; dz: number } }>(bomberId, "GridMover");
  return m?.queuedDirection ?? { dx: 0, dz: 0 };
}

describe("createKaboomBombBlockSystem (S152)", () => {
  it("walking into an EMPTY cell — no block", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, { dx: 1, dz: 0 });
    const occ = createGridOccupancySystem();
    const sys = createKaboomBombBlockSystem({ occupancy: occ });
    step(world, occ, sys);
    expect(queuedDirection(world, "player.1")).toEqual({ dx: 1, dz: 0 });
  });

  it("walking INTO another bomber's bomb — blocked", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, { dx: 1, dz: 0 });
    addBomb(world, "bomb.bot", 6, 5, "bot.1");
    const occ = createGridOccupancySystem();
    const sys = createKaboomBombBlockSystem({ occupancy: occ });
    step(world, occ, sys);
    expect(queuedDirection(world, "player.1")).toEqual({ dx: 0, dz: 0 });
  });

  it("walking AWAY from own bomb — never blocked (grace)", () => {
    // Bomber on (5,5), own bomb at (5,5), wants to step to (6,5).
    // Target cell (6,5) is empty → no block, move proceeds.
    const world = new World();
    addBomber(world, "player.1", 5, 5, { dx: 1, dz: 0 });
    addBomb(world, "bomb.self", 5, 5, "player.1");
    const occ = createGridOccupancySystem();
    const sys = createKaboomBombBlockSystem({ occupancy: occ });
    step(world, occ, sys);
    expect(queuedDirection(world, "player.1")).toEqual({ dx: 1, dz: 0 });
  });

  it("walking BACK into own bomb after step-off, no bombPass — blocked", () => {
    // Bomber stepped to (6,5), own bomb still at (5,5). User pushes
    // left → target (5,5) → own bomb post-step-off → blocked.
    const world = new World();
    addBomber(world, "player.1", 6, 5, { dx: -1, dz: 0 });
    addBomb(world, "bomb.self", 5, 5, "player.1");
    const occ = createGridOccupancySystem();
    const sys = createKaboomBombBlockSystem({ occupancy: occ });
    step(world, occ, sys);
    expect(queuedDirection(world, "player.1")).toEqual({ dx: 0, dz: 0 });
  });

  it("walking BACK into own bomb after step-off, WITH bombPass — allowed", () => {
    const world = new World();
    addBomber(world, "player.1", 6, 5, { dx: -1, dz: 0 }, true);
    addBomb(world, "bomb.self", 5, 5, "player.1");
    const occ = createGridOccupancySystem();
    const sys = createKaboomBombBlockSystem({ occupancy: occ });
    step(world, occ, sys);
    expect(queuedDirection(world, "player.1")).toEqual({ dx: -1, dz: 0 });
  });

  it("bombPass does NOT let you walk into ANOTHER bomber's bomb", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, { dx: 1, dz: 0 }, true);
    addBomb(world, "bomb.bot", 6, 5, "bot.1");
    const occ = createGridOccupancySystem();
    const sys = createKaboomBombBlockSystem({ occupancy: occ });
    step(world, occ, sys);
    expect(queuedDirection(world, "player.1")).toEqual({ dx: 0, dz: 0 });
  });

  it("mid-tween bombers are skipped (targetGx already set)", () => {
    const world = new World();
    addBomber(world, "player.1", 6, 5, { dx: -1, dz: 0 });
    // Simulate mid-tween: targetGx + targetGz set by grid-movement.
    const mover = world.getComponent<{ speed: number; queuedDirection?: { dx: number; dz: number }; targetGx?: number; targetGz?: number }>("player.1", "GridMover")!;
    world.setComponent("player.1", "GridMover", { ...mover, targetGx: 5, targetGz: 5 });
    addBomb(world, "bomb.self", 5, 5, "player.1");
    const occ = createGridOccupancySystem();
    const sys = createKaboomBombBlockSystem({ occupancy: occ });
    step(world, occ, sys);
    // queuedDirection untouched — the move already started, will commit.
    expect(queuedDirection(world, "player.1")).toEqual({ dx: -1, dz: 0 });
  });

  it("dead bombers are skipped", () => {
    const world = new World();
    addBomber(world, "player.1", 6, 5, { dx: -1, dz: 0 });
    world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: false });
    addBomb(world, "bomb.self", 5, 5, "player.1");
    const occ = createGridOccupancySystem();
    const sys = createKaboomBombBlockSystem({ occupancy: occ });
    step(world, occ, sys);
    expect(queuedDirection(world, "player.1")).toEqual({ dx: -1, dz: 0 });
  });

  it("zero direction (no movement intent) — no work", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, { dx: 0, dz: 0 });
    addBomb(world, "bomb.bot", 6, 5, "bot.1");
    const occ = createGridOccupancySystem();
    const sys = createKaboomBombBlockSystem({ occupancy: occ });
    step(world, occ, sys);
    expect(queuedDirection(world, "player.1")).toEqual({ dx: 0, dz: 0 });
  });

  it("bombPass + Kick combo: bomber walks into the cell their kicked bomb just left", () => {
    // Setup: bomber at (4,5), bomb that USED to be at (5,5) has just
    // been kicked to (6,5). Bomber wants to walk to (5,5) — that cell
    // is now empty. No bomb there → no block.
    const world = new World();
    addBomber(world, "player.1", 4, 5, { dx: 1, dz: 0 }, true);
    addBomb(world, "bomb.self", 6, 5, "player.1"); // bomb at new cell
    const occ = createGridOccupancySystem();
    const sys = createKaboomBombBlockSystem({ occupancy: occ });
    step(world, occ, sys);
    expect(queuedDirection(world, "player.1")).toEqual({ dx: 1, dz: 0 });
  });

  it("multi-bomb cell: ANY blocking bomb at the target blocks the move", () => {
    // Two bombs at the same cell (rare but legal after a kick + warp).
    // One is own, one is other's. The other's bomb is the blocker.
    const world = new World();
    addBomber(world, "player.1", 5, 5, { dx: 1, dz: 0 }, true);
    addBomb(world, "bomb.self", 6, 5, "player.1");
    addBomb(world, "bomb.bot", 6, 5, "bot.1");
    const occ = createGridOccupancySystem();
    const sys = createKaboomBombBlockSystem({ occupancy: occ });
    step(world, occ, sys);
    expect(queuedDirection(world, "player.1")).toEqual({ dx: 0, dz: 0 });
  });
});
