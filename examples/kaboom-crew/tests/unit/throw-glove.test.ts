// S144 KABOOM-THROW-GLOVE unit tests. Exercises the pickup-collect →
// canThrow flag → bomb-pickup-system → fuse-pause → bomb-throw-system
// → land chain.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { createKaboomBombFuseSystem } from "../../src/systems/bomb-fuse-system";
import { createKaboomBombPickupSystem } from "../../src/systems/bomb-pickup-system";
import { createKaboomBombThrowSystem, resolveFacingDirection } from "../../src/systems/bomb-throw-system";

function ctx(world: World, fixedDt = 1 / 60) {
  return { world, time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 } };
}

function addBomber(world: World, id: string, gx: number, gz: number, opts: { canThrow?: boolean; carryingBombId?: string } = {}): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: id, blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "BomberStats", {
    maxBombs: 1,
    range: 2,
    activeBombs: 1,
    alive: true,
    canThrow: opts.canThrow ?? true,
    ...(opts.carryingBombId !== undefined ? { carryingBombId: opts.carryingBombId } : {})
  });
}

function addBomb(world: World, id: string, gx: number, gz: number, opts: { owner?: string; fuse?: number } = {}): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "bomb", blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "Bomb", {
    fuseRemaining: opts.fuse ?? 2.0,
    range: 2,
    ownerId: opts.owner ?? "player.1"
  });
}

function addHardWall(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "wall", blocksMovement: true, blocksBlast: true });
}

describe("resolveFacingDirection (S144 helper)", () => {
  it("uses queued direction first when non-zero", () => {
    expect(resolveFacingDirection({ dx: 1, dz: 0 }, 90)).toEqual({ dx: 1, dz: 0 });
    expect(resolveFacingDirection({ dx: 0, dz: 1 }, 0)).toEqual({ dx: 0, dz: 1 });
  });

  it("falls back to yawDeg cardinal snap when queued is zero", () => {
    expect(resolveFacingDirection({ dx: 0, dz: 0 }, 0)).toEqual({ dx: 0, dz: -1 });
    expect(resolveFacingDirection({ dx: 0, dz: 0 }, 90)).toEqual({ dx: 1, dz: 0 });
    expect(resolveFacingDirection({ dx: 0, dz: 0 }, 180)).toEqual({ dx: 0, dz: 1 });
    expect(resolveFacingDirection({ dx: 0, dz: 0 }, -90)).toEqual({ dx: -1, dz: 0 });
  });

  it("falls back to +Z when no facing data is available", () => {
    expect(resolveFacingDirection(undefined, undefined)).toEqual({ dx: 0, dz: 1 });
  });
});

describe("createKaboomBombPickupSystem (S144)", () => {
  it("PickupBombRequest with valid bomb + cell → sets Bomb.carriedBy + decrements activeBombs + clears GridOccupant", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 4, { canThrow: true });
    addBomb(world, "bomb.a", 3, 4, { owner: "player.1" });
    world.setComponent("player.1", "PickupBombRequest", { bombId: "bomb.a" });
    const sys = createKaboomBombPickupSystem();
    sys.fixedUpdate!(ctx(world));
    const bomb = world.getComponent<{ carriedBy?: string }>("bomb.a", "Bomb")!;
    expect(bomb.carriedBy).toBe("player.1");
    const stats = world.getComponent<{ activeBombs?: number; carryingBombId?: string }>("player.1", "BomberStats")!;
    expect(stats.activeBombs).toBe(0);
    expect(stats.carryingBombId).toBe("bomb.a");
    expect(world.hasComponent("bomb.a", "GridOccupant")).toBe(false);
    expect(world.hasComponent("player.1", "PickupBombRequest")).toBe(false);
  });

  it("PickupBombRequest with wrong-owner bomb → silent NO-OP", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 4, { canThrow: true });
    addBomb(world, "bomb.other", 3, 4, { owner: "bot.1" });
    world.setComponent("player.1", "PickupBombRequest", { bombId: "bomb.other" });
    const sys = createKaboomBombPickupSystem();
    sys.fixedUpdate!(ctx(world));
    const bomb = world.getComponent<{ carriedBy?: string }>("bomb.other", "Bomb")!;
    expect(bomb.carriedBy).toBeUndefined();
    const stats = world.getComponent<{ carryingBombId?: string }>("player.1", "BomberStats")!;
    expect(stats.carryingBombId).toBeUndefined();
  });

  it("PickupBombRequest with bomb on different cell → silent NO-OP", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 4, { canThrow: true });
    addBomb(world, "bomb.away", 8, 8, { owner: "player.1" });
    world.setComponent("player.1", "PickupBombRequest", { bombId: "bomb.away" });
    const sys = createKaboomBombPickupSystem();
    sys.fixedUpdate!(ctx(world));
    const bomb = world.getComponent<{ carriedBy?: string }>("bomb.away", "Bomb")!;
    expect(bomb.carriedBy).toBeUndefined();
  });

  it("PickupBombRequest without canThrow → silent NO-OP (defensive)", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 4, { canThrow: false });
    addBomb(world, "bomb.a", 3, 4, { owner: "player.1" });
    world.setComponent("player.1", "PickupBombRequest", { bombId: "bomb.a" });
    const sys = createKaboomBombPickupSystem();
    sys.fixedUpdate!(ctx(world));
    const bomb = world.getComponent<{ carriedBy?: string }>("bomb.a", "Bomb")!;
    expect(bomb.carriedBy).toBeUndefined();
  });
});

describe("createKaboomBombFuseSystem + carried bombs (S144)", () => {
  it("fuse skips bombs with carriedBy set", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 4, { canThrow: true, carryingBombId: "bomb.a" });
    addBomb(world, "bomb.a", 3, 4, { owner: "player.1", fuse: 1.0 });
    world.setComponent("bomb.a", "Bomb", {
      fuseRemaining: 1.0,
      range: 2,
      ownerId: "player.1",
      carriedBy: "player.1"
    });
    const sys = createKaboomBombFuseSystem();
    sys.fixedUpdate!(ctx(world));
    const bomb = world.getComponent<{ fuseRemaining: number }>("bomb.a", "Bomb")!;
    expect(bomb.fuseRemaining).toBe(1.0); // unchanged
  });

  it("fuse skips airborne bombs", () => {
    const world = new World();
    addBomb(world, "bomb.fly", 3, 4, { fuse: 1.0 });
    world.setComponent("bomb.fly", "Bomb", {
      fuseRemaining: 1.0,
      range: 2,
      ownerId: "player.1",
      airborne: true
    });
    const sys = createKaboomBombFuseSystem();
    sys.fixedUpdate!(ctx(world));
    const bomb = world.getComponent<{ fuseRemaining: number }>("bomb.fly", "Bomb")!;
    expect(bomb.fuseRemaining).toBe(1.0); // unchanged
  });
});

describe("createKaboomBombThrowSystem (S144)", () => {
  it("ThrowBombRequest with clear lane → bomb lands at +3 cells in facing", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 4, { canThrow: true, carryingBombId: "bomb.a" });
    // Bomber facing +X.
    world.setComponent("player.1", "GridMover", { speed: 4, queuedDirection: { dx: 1, dz: 0 } });
    addBomb(world, "bomb.a", 3, 4, { owner: "player.1", fuse: 1.5 });
    world.setComponent("bomb.a", "Bomb", {
      fuseRemaining: 1.5,
      range: 2,
      ownerId: "player.1",
      carriedBy: "player.1"
    });
    world.removeComponent("bomb.a", "GridOccupant");
    world.setComponent("player.1", "ThrowBombRequest", {});
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const sys = createKaboomBombThrowSystem({ occupancy: occ });
    sys.fixedUpdate!(ctx(world));
    // Landing cell stored on GridPosition.
    const bombPos = world.getComponent<{ gx?: number; gz?: number }>("bomb.a", "GridPosition")!;
    expect(bombPos.gx).toBe(6); // 3 + 3
    expect(bombPos.gz).toBe(4);
    const bomb = world.getComponent<{ airborne?: boolean; carriedBy?: string; airborneRemaining?: number }>("bomb.a", "Bomb")!;
    expect(bomb.airborne).toBe(true);
    expect(bomb.carriedBy).toBeUndefined();
    expect(bomb.airborneRemaining).toBeGreaterThan(0);
    const stats = world.getComponent<{ carryingBombId?: string }>("player.1", "BomberStats")!;
    expect(stats.carryingBombId).toBeUndefined();
  });

  it("hard wall at +3 → bomb lands at +2 (graceful fallback)", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 4, { canThrow: true, carryingBombId: "bomb.a" });
    world.setComponent("player.1", "GridMover", { speed: 4, queuedDirection: { dx: 1, dz: 0 } });
    addBomb(world, "bomb.a", 3, 4, { owner: "player.1" });
    world.setComponent("bomb.a", "Bomb", {
      fuseRemaining: 1.5,
      range: 2,
      ownerId: "player.1",
      carriedBy: "player.1"
    });
    world.removeComponent("bomb.a", "GridOccupant");
    addHardWall(world, "wall.east", 6, 4); // blocks the +3 landing
    world.setComponent("player.1", "ThrowBombRequest", {});
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const sys = createKaboomBombThrowSystem({ occupancy: occ });
    sys.fixedUpdate!(ctx(world));
    const bombPos = world.getComponent<{ gx?: number; gz?: number }>("bomb.a", "GridPosition")!;
    expect(bombPos.gx).toBe(5); // 3 + 2
    expect(bombPos.gz).toBe(4);
  });

  it("hard wall at +1 → bomb lands at bomber cell (last-resort fallback)", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 4, { canThrow: true, carryingBombId: "bomb.a" });
    world.setComponent("player.1", "GridMover", { speed: 4, queuedDirection: { dx: 1, dz: 0 } });
    addBomb(world, "bomb.a", 3, 4, { owner: "player.1" });
    world.setComponent("bomb.a", "Bomb", {
      fuseRemaining: 1.5,
      range: 2,
      ownerId: "player.1",
      carriedBy: "player.1"
    });
    world.removeComponent("bomb.a", "GridOccupant");
    addHardWall(world, "wall.+1", 4, 4);
    addHardWall(world, "wall.+2", 5, 4);
    addHardWall(world, "wall.+3", 6, 4);
    world.setComponent("player.1", "ThrowBombRequest", {});
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const sys = createKaboomBombThrowSystem({ occupancy: occ });
    sys.fixedUpdate!(ctx(world));
    const bombPos = world.getComponent<{ gx?: number; gz?: number }>("bomb.a", "GridPosition")!;
    expect(bombPos.gx).toBe(3); // bomber cell
    expect(bombPos.gz).toBe(4);
  });

  it("airborne timer ticks down and the bomb lands (flag cleared, GridOccupant restored)", () => {
    const world = new World();
    addBomb(world, "bomb.fly", 5, 4);
    world.removeComponent("bomb.fly", "GridOccupant");
    world.setComponent("bomb.fly", "Bomb", {
      fuseRemaining: 1.5,
      range: 2,
      ownerId: "player.1",
      airborne: true,
      airborneRemaining: 1 / 60
    });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const sys = createKaboomBombThrowSystem({ occupancy: occ });
    sys.fixedUpdate!(ctx(world));
    const bomb = world.getComponent<{ airborne?: boolean; airborneRemaining?: number }>("bomb.fly", "Bomb")!;
    expect(bomb.airborne).toBe(false);
    expect(bomb.airborneRemaining).toBe(0);
    expect(world.hasComponent("bomb.fly", "GridOccupant")).toBe(true);
  });

  it("S245 KABOOM-THROW-LAND-PUFF: co-spawns a ParticleEmitter at the landing cell", () => {
    const world = new World();
    addBomb(world, "bomb.fly", 7, 9);
    world.removeComponent("bomb.fly", "GridOccupant");
    world.setComponent("bomb.fly", "Bomb", {
      fuseRemaining: 1.5,
      range: 2,
      ownerId: "player.1",
      airborne: true,
      airborneRemaining: 1 / 60
    });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const sys = createKaboomBombThrowSystem({ occupancy: occ });
    sys.fixedUpdate!(ctx(world));
    const puffIds: string[] = [];
    for (const id of world.entityIds()) {
      if (id.startsWith("bomb.fly.throw-land.")) puffIds.push(id);
    }
    expect(puffIds.length).toBe(1);
    const puffId = puffIds[0]!;
    const emitter = world.getComponent<{
      preset?: string;
      lifetime?: number;
      maxParticles?: number;
    }>(puffId, "ParticleEmitter")!;
    expect(emitter.preset).toBe("spark");
    expect(emitter.lifetime).toBeCloseTo(0.25, 6);
    expect(emitter.maxParticles).toBe(10);
    const transform = world.getComponent<{ position: ReadonlyArray<number> }>(puffId, "Transform")!;
    expect(transform.position[0]).toBe(7);
    expect(transform.position[2]).toBe(9);
  });
});
