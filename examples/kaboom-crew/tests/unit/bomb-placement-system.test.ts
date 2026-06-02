// S82 KABOOM-BOMB-PLACE unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { createKaboomBombPlacementSystem } from "../../src/systems/bomb-placement-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function makePlayer(world: World, id: string, gx: number, gz: number, opts: { maxBombs?: number; activeBombs?: number; range?: number; alive?: boolean } = {}): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "BomberStats", {
    maxBombs: opts.maxBombs ?? 1,
    range: opts.range ?? 2,
    activeBombs: opts.activeBombs ?? 0,
    alive: opts.alive ?? true
  });
  world.setComponent(id, "PlaceBombRequest", {});
}

describe("createKaboomBombPlacementSystem (S82 KABOOM-BOMB-PLACE)", () => {
  it("spawns a Bomb entity on the requester's cell + increments activeBombs", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4);
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.test" });
    system.frameUpdate!(ctx(world));
    expect(world.hasEntity("bomb.test")).toBe(true);
    const bomb = world.getComponent("bomb.test", "Bomb") as { fuseRemaining: number; range: number; ownerId: string };
    expect(bomb.range).toBe(2);
    expect(bomb.ownerId).toBe("player.1");
    const stats = world.getComponent("player.1", "BomberStats") as { activeBombs: number };
    expect(stats.activeBombs).toBe(1);
    expect(world.hasComponent("player.1", "PlaceBombRequest")).toBe(false);
  });

  it("S142 KABOOM-PIERCE-BOMB: pierce owner places → Bomb.pierce true", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4);
    // Stamp pierce on the owner.
    world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, activeBombs: 0, alive: true, pierce: true });
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.pierce" });
    system.frameUpdate!(ctx(world));
    const bomb = world.getComponent<{ pierce?: boolean }>("bomb.pierce", "Bomb")!;
    expect(bomb.pierce).toBe(true);
  });

  it("S142 KABOOM-PIERCE-BOMB: non-pierce owner places → Bomb.pierce undefined", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4);
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.plain" });
    system.frameUpdate!(ctx(world));
    const bomb = world.getComponent<{ pierce?: boolean }>("bomb.plain", "Bomb")!;
    expect(bomb.pierce).toBeUndefined();
  });

  it("S138 KABOOM-BOMB-COLLIDER: placed bomb carries RigidBody3D + Collider3D so ragdoll bodies bounce off", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4);
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.test" });
    system.frameUpdate!(ctx(world));
    const body = world.getComponent("bomb.test", "RigidBody3D") as { type?: string };
    expect(body?.type).toBe("fixed");
    const collider = world.getComponent("bomb.test", "Collider3D") as { kind?: string; radius?: number };
    expect(collider?.kind).toBe("sphere");
    // Radius matches the bomb's final visual size (sphere r=0.5 × scale 0.35 = 0.175).
    expect(collider?.radius).toBeCloseTo(0.175, 6);
  });

  it("S243 KABOOM-BOMB-SPAWN-PUFF: co-spawns a short-lived ParticleEmitter at the bomb cell", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4);
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.test" });
    system.frameUpdate!(ctx(world));
    expect(world.hasEntity("bomb.test.puff")).toBe(true);
    const emitter = world.getComponent("bomb.test.puff", "ParticleEmitter") as {
      preset?: string;
      lifetime?: number;
      elapsed?: number;
      rate?: number;
      maxParticles?: number;
    };
    expect(emitter.preset).toBe("spark");
    expect(emitter.lifetime).toBeCloseTo(0.3, 6);
    expect(emitter.elapsed).toBe(0);
    expect(emitter.maxParticles).toBe(8);
    const transform = world.getComponent("bomb.test.puff", "Transform") as { position: ReadonlyArray<number> };
    expect(transform.position[0]).toBe(3);
    expect(transform.position[2]).toBe(4);
  });

  it("S243 KABOOM-BOMB-SPAWN-PUFF: refused placement (maxBombs cap) does NOT spawn a puff", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4, { activeBombs: 1, maxBombs: 1 });
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.refused" });
    system.frameUpdate!(ctx(world));
    expect(world.hasEntity("bomb.refused")).toBe(false);
    expect(world.hasEntity("bomb.refused.puff")).toBe(false);
  });

  it("S095 KABOOM-SPAWN-POP-TWEEN: bomb spawns at scale 0 with an easeOutBack Tween to its final size", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4);
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.test" });
    system.frameUpdate!(ctx(world));
    const transform = world.getComponent("bomb.test", "Transform") as { scale: ReadonlyArray<number> };
    expect(transform.scale).toEqual([0, 0, 0]);
    const tweens = world.getComponent("bomb.test", "Tweens") as ReadonlyArray<{
      component: string;
      property: string;
      from: ReadonlyArray<number>;
      to: ReadonlyArray<number>;
      duration: number;
      ease: string;
    }>;
    expect(tweens.length).toBe(1);
    expect(tweens[0]!.component).toBe("Transform");
    expect(tweens[0]!.property).toBe("scale");
    expect(tweens[0]!.from).toEqual([0, 0, 0]);
    expect(tweens[0]!.to).toEqual([0.35, 0.35, 0.35]);
    expect(tweens[0]!.duration).toBeCloseTo(0.2, 3);
    expect(tweens[0]!.ease).toBe("easeOutBack");
  });

  it("refuses when activeBombs already hits maxBombs", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4, { maxBombs: 1, activeBombs: 1 });
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy });
    system.frameUpdate!(ctx(world));
    // No bomb entity created — the only entity is the player.
    let bombs = 0;
    for (const id of world.entityIds()) {
      if (world.hasComponent(id, "Bomb")) bombs += 1;
    }
    expect(bombs).toBe(0);
    // Request is still consumed even on refusal.
    expect(world.hasComponent("player.1", "PlaceBombRequest")).toBe(false);
  });

  it("refuses when a bomb already occupies the cell (no stacking)", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4);
    // Pre-existing bomb on (3,4).
    world.addEntity("bomb.existing");
    world.setComponent("bomb.existing", "GridPosition", { gx: 3, gz: 4 });
    world.setComponent("bomb.existing", "GridOccupant", { layer: "bomb" });
    world.setComponent("bomb.existing", "Bomb", { fuseRemaining: 2, range: 2, ownerId: "player.1" });
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.new" });
    system.frameUpdate!(ctx(world));
    expect(world.hasEntity("bomb.new")).toBe(false);
  });

  it("refuses when the bomber is no longer alive", () => {
    const world = new World();
    makePlayer(world, "player.1", 3, 4, { alive: false });
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    const system = createKaboomBombPlacementSystem({ occupancy, nextBombId: () => "bomb.dead" });
    system.frameUpdate!(ctx(world));
    expect(world.hasEntity("bomb.dead")).toBe(false);
  });

  it("two bombers on different cells each get their own bomb", () => {
    const world = new World();
    makePlayer(world, "player.1", 1, 1);
    makePlayer(world, "bot.1", 9, 5);
    const occupancy = createGridOccupancySystem();
    occupancy.frameUpdate!(ctx(world));
    let n = 0;
    const system = createKaboomBombPlacementSystem({
      occupancy,
      nextBombId: () => `bomb.${++n}`
    });
    system.frameUpdate!(ctx(world));
    expect(world.hasEntity("bomb.1")).toBe(true);
    expect(world.hasEntity("bomb.2")).toBe(true);
  });
});
