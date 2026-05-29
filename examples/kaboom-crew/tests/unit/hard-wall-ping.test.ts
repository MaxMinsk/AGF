// S193 — when a blast stops at a hard wall cell, a tiny spark
// ParticleEmitter is co-spawned at the wall's impact face so the
// player sees WHERE the blast stopped. Soft-block stops don't get
// this — they already get the block-destruction debris + tile spark.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { createKaboomBlastPropagationSystem } from "../../src/systems/blast-propagation-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function seedGrid(world: World): void {
  world.addEntity("grid.config");
  world.setComponent("grid.config", "Grid", {
    cellSize: 1,
    sizeX: 10,
    sizeZ: 10,
    originX: 0,
    originZ: 0
  });
}

function spawnHardBlock(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", {
    position: [gx, 0.5, gz],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent(id, "MeshRenderer", { mesh: "box", color: "#41525f" });
  world.setComponent(id, "GridOccupant", { layer: "wall", blocksMovement: true, blocksBlast: true });
}

function spawnSoftBlock(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", {
    position: [gx, 0.45, gz],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent(id, "MeshRenderer", { mesh: "box", color: "#c98a4e" });
  world.setComponent(id, "GridOccupant", { layer: "block", blocksMovement: true, blocksBlast: false });
}

function emitBlast(world: World, eventId: string, originGx: number, originGz: number, range: number): void {
  world.addEntity(eventId);
  world.setComponent(eventId, "BlastEvent", { originGx, originGz, range, ownerId: "player.1" });
}

function countPingEmitters(world: World): number {
  let n = 0;
  for (const id of world.entityIds()) {
    if (id.startsWith("kaboom.hard-wall-ping.")) n += 1;
  }
  return n;
}

describe("hard-wall blast ping (S193)", () => {
  it("blast east into a hard wall spawns a ping emitter at that wall", () => {
    const world = new World();
    seedGrid(world);
    spawnHardBlock(world, "wall.east", 5, 5);
    emitBlast(world, "evt.1", 3, 5, 3);
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy });
    blast.fixedUpdate!(ctx(world));
    expect(countPingEmitters(world)).toBe(1);
  });

  it("blast stopping at a soft block does NOT spawn a hard-wall ping", () => {
    const world = new World();
    seedGrid(world);
    spawnSoftBlock(world, "soft.east", 5, 5);
    emitBlast(world, "evt.1", 3, 5, 3);
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy });
    blast.fixedUpdate!(ctx(world));
    expect(countPingEmitters(world)).toBe(0);
  });

  it("blast that reaches its max range without hitting anything spawns no ping", () => {
    const world = new World();
    seedGrid(world);
    emitBlast(world, "evt.1", 3, 5, 1);
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy });
    blast.fixedUpdate!(ctx(world));
    expect(countPingEmitters(world)).toBe(0);
  });

  it("blast hitting hard walls in three directions spawns three ping emitters", () => {
    const world = new World();
    seedGrid(world);
    spawnHardBlock(world, "wall.east", 5, 5);
    spawnHardBlock(world, "wall.north", 3, 3);
    spawnHardBlock(world, "wall.south", 3, 7);
    // West stays open — only 3 walls.
    emitBlast(world, "evt.1", 3, 5, 3);
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy });
    blast.fixedUpdate!(ctx(world));
    expect(countPingEmitters(world)).toBe(3);
  });

  it("ping emitter is positioned at the wall's impact-facing edge (cell - direction * 0.5)", () => {
    const world = new World();
    seedGrid(world);
    spawnHardBlock(world, "wall.east", 5, 5);
    emitBlast(world, "evt.1", 3, 5, 3);
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const blast = createKaboomBlastPropagationSystem({ occupancy });
    blast.fixedUpdate!(ctx(world));
    let found: { x: number; z: number } | undefined;
    for (const id of world.entityIds()) {
      if (!id.startsWith("kaboom.hard-wall-ping.")) continue;
      const t = world.getComponent<{ position?: ReadonlyArray<number> }>(id, "Transform");
      const [x, , z] = t!.position!;
      found = { x: x ?? -1, z: z ?? -1 };
    }
    expect(found).toBeDefined();
    // East-facing wall at (5,5), blast came from west (dx=+1). Edge =
    // (5 - 0.5, _, 5 - 0) = (4.5, _, 5).
    expect(found!.x).toBeCloseTo(4.5, 5);
    expect(found!.z).toBeCloseTo(5, 5);
  });
});
