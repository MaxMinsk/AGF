// S100 KABOOM-KICK-POWER-UP — bump-to-kick mechanic.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomBombKickSystem } from "../../src/systems/bomb-kick-system";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomber(world: World, id: string, gx: number, gz: number, opts: { canKick?: boolean; alive?: boolean; queuedDirection?: { dx: number; dz: number }; currentLerp?: number } = {}) {
  world.addEntity(id);
  world.setComponent(id, "PlayerControlled", { speed: 4 });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive: opts.alive ?? true, canKick: opts.canKick ?? false });
  world.setComponent(id, "GridMover", {
    speed: 4,
    queuedDirection: opts.queuedDirection ?? { dx: 0, dz: 0 },
    currentLerp: opts.currentLerp ?? 0
  });
}

function addBomb(world: World, id: string, gx: number, gz: number, ownerId: string) {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.35, gz], rotation: [0, 0, 0], scale: [0.35, 0.35, 0.35] });
  world.setComponent(id, "Bomb", { fuseRemaining: 2.5, range: 2, ownerId });
  world.setComponent(id, "GridOccupant", { layer: "bomb", blocksMovement: false, blocksBlast: false });
}

function addHardWall(world: World, id: string, gx: number, gz: number) {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "hard", blocksMovement: true, blocksBlast: true });
}

// Tiny occupancy stub: implements the GridOccupancyQuery surface by
// scanning world.query each call. Cheap for small test arenas; we
// don't need the indexed real occupancy system to validate kick logic.
function makeOccupancy(world: World) {
  return {
    occupants: (gx: number, gz: number, layer?: string): ReadonlyArray<string> => {
      const out: string[] = [];
      for (const id of world.createQuery(["GridPosition", "GridOccupant"]).run()) {
        const pos = world.getComponent<{ gx: number; gz: number }>(id, "GridPosition");
        const occ = world.getComponent<{ layer?: string }>(id, "GridOccupant");
        if (pos?.gx !== gx || pos?.gz !== gz) continue;
        if (layer !== undefined && occ?.layer !== layer) continue;
        out.push(id);
      }
      return out;
    },
    blocked: (gx: number, gz: number, predicate: "movement" | "blast" = "movement"): boolean => {
      for (const id of world.createQuery(["GridPosition", "GridOccupant"]).run()) {
        const pos = world.getComponent<{ gx: number; gz: number }>(id, "GridPosition");
        if (pos?.gx !== gx || pos?.gz !== gz) continue;
        const occ = world.getComponent<{ blocksMovement?: boolean; blocksBlast?: boolean }>(id, "GridOccupant");
        if (predicate === "movement" && occ?.blocksMovement === true) return true;
        if (predicate === "blast" && occ?.blocksBlast === true) return true;
      }
      return false;
    },
    occupiedCells: () => []
  };
}

describe("createKaboomBombKickSystem (S100 KABOOM-KICK-POWER-UP)", () => {
  it("kick succeeds onto an empty cell — bomb slides forward", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 3, { canKick: true, queuedDirection: { dx: 1, dz: 0 } });
    addBomb(world, "bomb.own", 4, 3, "player.1");
    const system = createKaboomBombKickSystem({ occupancy: makeOccupancy(world) });
    system.fixedUpdate!(ctx(world));
    const pos = world.getComponent("bomb.own", "GridPosition") as { gx: number; gz: number };
    expect(pos).toEqual({ gx: 5, gz: 3 });
    // Transform.position also updates so the renderer follows.
    const transform = world.getComponent("bomb.own", "Transform") as { position: ReadonlyArray<number> };
    expect(transform.position[0]).toBe(5);
    expect(transform.position[2]).toBe(3);
  });

  it("no kick when the bomber doesn't have canKick", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 3, { canKick: false, queuedDirection: { dx: 1, dz: 0 } });
    addBomb(world, "bomb.own", 4, 3, "player.1");
    const system = createKaboomBombKickSystem({ occupancy: makeOccupancy(world) });
    system.fixedUpdate!(ctx(world));
    const pos = world.getComponent("bomb.own", "GridPosition") as { gx: number; gz: number };
    expect(pos).toEqual({ gx: 4, gz: 3 });
  });

  it("kick fails into a hard wall — bomb stays put", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 3, { canKick: true, queuedDirection: { dx: 1, dz: 0 } });
    addBomb(world, "bomb.own", 4, 3, "player.1");
    addHardWall(world, "wall.1", 5, 3);
    const system = createKaboomBombKickSystem({ occupancy: makeOccupancy(world) });
    system.fixedUpdate!(ctx(world));
    const pos = world.getComponent("bomb.own", "GridPosition") as { gx: number; gz: number };
    expect(pos).toEqual({ gx: 4, gz: 3 });
  });

  it("kick fails when another bomb sits at the beyond cell", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 3, { canKick: true, queuedDirection: { dx: 1, dz: 0 } });
    addBomb(world, "bomb.own", 4, 3, "player.1");
    addBomb(world, "bomb.other", 5, 3, "player.2");
    const system = createKaboomBombKickSystem({ occupancy: makeOccupancy(world) });
    system.fixedUpdate!(ctx(world));
    const pos = world.getComponent("bomb.own", "GridPosition") as { gx: number; gz: number };
    expect(pos).toEqual({ gx: 4, gz: 3 });
  });

  it("you can only kick YOUR own bombs — another player's bomb stays put", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 3, { canKick: true, queuedDirection: { dx: 1, dz: 0 } });
    addBomb(world, "bomb.others", 4, 3, "bot.1");
    const system = createKaboomBombKickSystem({ occupancy: makeOccupancy(world) });
    system.fixedUpdate!(ctx(world));
    const pos = world.getComponent("bomb.others", "GridPosition") as { gx: number; gz: number };
    expect(pos).toEqual({ gx: 4, gz: 3 });
  });

  it("no kick when bomber is mid-lerp (currentLerp > 0)", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 3, { canKick: true, queuedDirection: { dx: 1, dz: 0 }, currentLerp: 0.5 });
    addBomb(world, "bomb.own", 4, 3, "player.1");
    const system = createKaboomBombKickSystem({ occupancy: makeOccupancy(world) });
    system.fixedUpdate!(ctx(world));
    const pos = world.getComponent("bomb.own", "GridPosition") as { gx: number; gz: number };
    expect(pos).toEqual({ gx: 4, gz: 3 });
  });

  it("dead bombers don't kick", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 3, { canKick: true, alive: false, queuedDirection: { dx: 1, dz: 0 } });
    addBomb(world, "bomb.own", 4, 3, "player.1");
    const system = createKaboomBombKickSystem({ occupancy: makeOccupancy(world) });
    system.fixedUpdate!(ctx(world));
    const pos = world.getComponent("bomb.own", "GridPosition") as { gx: number; gz: number };
    expect(pos).toEqual({ gx: 4, gz: 3 });
  });

  it("no kick when queuedDirection is zero (bomber not moving)", () => {
    const world = new World();
    addBomber(world, "player.1", 3, 3, { canKick: true, queuedDirection: { dx: 0, dz: 0 } });
    addBomb(world, "bomb.own", 4, 3, "player.1");
    const system = createKaboomBombKickSystem({ occupancy: makeOccupancy(world) });
    system.fixedUpdate!(ctx(world));
    const pos = world.getComponent("bomb.own", "GridPosition") as { gx: number; gz: number };
    expect(pos).toEqual({ gx: 4, gz: 3 });
  });
});
