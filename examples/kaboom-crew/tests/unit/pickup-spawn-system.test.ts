// S82 KABOOM-PICKUPS-AND-STATS — PickupSpawnSystem unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomPickupSpawnSystem } from "../../src/systems/pickup-spawn-system";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function emitSoftBlockDestroyed(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "SoftBlockDestroyedEvent", { gx, gz });
}

describe("createKaboomPickupSpawnSystem (S82 KABOOM-PICKUPS-AND-STATS)", () => {
  it("consumes the event regardless of whether a pickup spawns", () => {
    const world = new World();
    emitSoftBlockDestroyed(world, "evt.1", 4, 6);
    // dropChance=0 → never spawn, but the event must still be cleared.
    const system = createKaboomPickupSpawnSystem({ dropChance: 0 });
    system.fixedUpdate!(ctx(world));
    expect(world.hasEntity("evt.1")).toBe(false);
    const pickups = [...world.createQuery(["Pickup"]).run()];
    expect(pickups).toEqual([]);
  });

  it("spawns a Pickup with deterministic-by-cell outcome", () => {
    const world1 = new World();
    emitSoftBlockDestroyed(world1, "evt.a", 3, 5);
    const sys1 = createKaboomPickupSpawnSystem({ seed: 42, dropChance: 1 });
    sys1.fixedUpdate!(ctx(world1));
    const pickup1 = [...world1.createQuery(["Pickup"]).run()];
    expect(pickup1).toHaveLength(1);
    const kind1 = world1.getComponent<{ kind: string }>(pickup1[0]!, "Pickup")?.kind;

    // Identical seed + cell → identical kind.
    const world2 = new World();
    emitSoftBlockDestroyed(world2, "evt.b", 3, 5);
    const sys2 = createKaboomPickupSpawnSystem({ seed: 42, dropChance: 1 });
    sys2.fixedUpdate!(ctx(world2));
    const pickup2 = [...world2.createQuery(["Pickup"]).run()];
    const kind2 = world2.getComponent<{ kind: string }>(pickup2[0]!, "Pickup")?.kind;
    expect(kind2).toBe(kind1);
  });

  it("spawns the pickup with GridPosition + GridOccupant.layer='pickup'", () => {
    const world = new World();
    emitSoftBlockDestroyed(world, "evt.1", 7, 3);
    const system = createKaboomPickupSpawnSystem({ dropChance: 1, seed: 7 });
    system.fixedUpdate!(ctx(world));
    const pickup = [...world.createQuery(["Pickup"]).run()][0]!;
    const pos = world.getComponent<{ gx: number; gz: number }>(pickup, "GridPosition");
    expect(pos).toEqual({ gx: 7, gz: 3 });
    const occ = world.getComponent<{ layer?: string; blocksMovement?: boolean }>(pickup, "GridOccupant");
    expect(occ?.layer).toBe("pickup");
    expect(occ?.blocksMovement).toBe(false);
  });

  it("S095 KABOOM-SPAWN-POP-TWEEN: pickup spawns at scale 0 with an easeOutBack Tween to visual.scale", () => {
    const world = new World();
    emitSoftBlockDestroyed(world, "evt.1", 5, 5);
    const system = createKaboomPickupSpawnSystem({ dropChance: 1, seed: 7 });
    system.fixedUpdate!(ctx(world));
    const pickup = [...world.createQuery(["Pickup"]).run()][0]!;
    const transform = world.getComponent(pickup, "Transform") as { scale: ReadonlyArray<number> };
    expect(transform.scale).toEqual([0, 0, 0]);
    const tweens = world.getComponent(pickup, "Tweens") as ReadonlyArray<{
      component: string;
      property: string;
      from: ReadonlyArray<number>;
      to: ReadonlyArray<number>;
      duration: number;
      ease: string;
    }>;
    expect(tweens.length).toBe(1);
    expect(tweens[0]!.ease).toBe("easeOutBack");
    expect(tweens[0]!.duration).toBeCloseTo(0.2, 3);
    expect(tweens[0]!.from).toEqual([0, 0, 0]);
    // Final scale matches the per-kind visual scale; assert at least
    // that it's non-zero on all axes.
    expect(tweens[0]!.to.every((c) => c > 0)).toBe(true);
  });

  it("S096 KABOOM-PICKUP-IDLE-PULSE: freshly-spawned pickup carries a 'glow' ParticleEmitter shimmer", () => {
    const world = new World();
    emitSoftBlockDestroyed(world, "evt.1", 6, 6);
    const system = createKaboomPickupSpawnSystem({ dropChance: 1, seed: 3 });
    system.fixedUpdate!(ctx(world));
    const pickup = [...world.createQuery(["Pickup"]).run()][0]!;
    const emitter = world.getComponent(pickup, "ParticleEmitter") as
      | { preset: string; rate?: number; maxParticles?: number; lifetime?: number }
      | undefined;
    expect(emitter).toBeDefined();
    expect(emitter!.preset).toBe("glow");
    expect(emitter!.rate).toBeGreaterThan(0);
    expect(emitter!.maxParticles).toBeGreaterThan(0);
    expect(emitter!.lifetime).toBeGreaterThan(1);
  });

  it("different seeds at the same cell may produce different kinds", () => {
    // Smoke-test that the seed actually mixes in. We don't assert
    // *which* kinds — just that the seeded surface isn't constant.
    const kinds = new Set<string>();
    for (let seed = 0; seed < 12; seed += 1) {
      const world = new World();
      emitSoftBlockDestroyed(world, "evt", 4, 4);
      const sys = createKaboomPickupSpawnSystem({ seed, dropChance: 1 });
      sys.fixedUpdate!(ctx(world));
      const pickup = [...world.createQuery(["Pickup"]).run()][0]!;
      const k = world.getComponent<{ kind: string }>(pickup, "Pickup")?.kind;
      if (k !== undefined) kinds.add(k);
    }
    expect(kinds.size).toBeGreaterThan(1);
  });
});
