// S208 KABOOM-LOOT-DROP (GDP-2026-05-30-001). Covers the pure
// drop-list helper + the system-level alive: true → false trigger,
// cap enforcement, deterministic per-death seed + the loot decay
// system that despawns un-collected drops after the lifetime.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createSeededRng } from "../../../../engine/core/util/seeded-rng";

import {
  LOOT_DROP_BOOLEAN_RATIO_DEFAULT,
  LOOT_DROP_CAP_DEFAULT,
  LOOT_DROP_LIFETIME_S_DEFAULT,
  computeDropList,
  createKaboomDeathPickupDropSystem,
  createKaboomLootDropDecaySystem
} from "../../src/systems/death-pickup-drop-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function setupBomber(world: World, id: string, stats: Record<string, unknown>): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", { alive: true, maxBombs: 1, range: 1, ...stats });
  world.setComponent(id, "GridPosition", { gx: 4, gz: 7 });
}

function killBomber(world: World, id: string): void {
  const stats = world.getComponent<Record<string, unknown>>(id, "BomberStats") ?? {};
  world.setComponent(id, "BomberStats", { ...stats, alive: false });
}

function countDrops(world: World): number {
  let n = 0;
  for (const id of world.entityIds()) {
    if (id.startsWith("pickup.") && id.includes(".drop.")) n += 1;
  }
  return n;
}

function countDropsOfKind(world: World, kind: string): number {
  let n = 0;
  for (const id of world.entityIds()) {
    if (id.startsWith(`pickup.${kind}.drop.`)) n += 1;
  }
  return n;
}

describe("kaboom death-pickup-drop (S208)", () => {
  it("computeDropList: numerics drop floor((bonus)/2) pickups", () => {
    const rng = createSeededRng(1);
    const list = computeDropList(
      { maxBombs: 5, range: 4, speed: 3, alive: false },
      rng,
      { booleanRatio: 0, cap: 10 }
    );
    expect(list.filter((k) => k === "bomb-up").length).toBe(2);
    expect(list.filter((k) => k === "fire-up").length).toBe(1);
    expect(list.filter((k) => k === "speed-up").length).toBe(1);
  });

  it("computeDropList: ratio=1 + all booleans → every flag drops once", () => {
    const rng = createSeededRng(1);
    const list = computeDropList(
      {
        maxBombs: 1,
        range: 1,
        canKick: true,
        remoteDetonateCharges: 2,
        shield: true,
        pierce: true,
        canThrow: true,
        bombPass: true,
        alive: false
      },
      rng,
      { booleanRatio: 1, cap: 10 }
    );
    expect(list).toContain("kick");
    expect(list).toContain("remote-detonate");
    expect(list).toContain("shield");
    expect(list).toContain("pierce");
    expect(list).toContain("throw-glove");
    expect(list).toContain("bomb-pass");
    expect(list.length).toBe(6);
  });

  it("computeDropList: ratio=0 → no boolean drops regardless of flags", () => {
    const rng = createSeededRng(1);
    const list = computeDropList(
      { maxBombs: 3, range: 1, canKick: true, shield: true, alive: false },
      rng,
      { booleanRatio: 0, cap: 10 }
    );
    expect(list).not.toContain("kick");
    expect(list).not.toContain("shield");
    expect(list.length).toBe(1); // just the single bomb-up from maxBombs=3
  });

  it("computeDropList: cap clips to per-death max + keeps numerics first", () => {
    const rng = createSeededRng(1);
    const list = computeDropList(
      {
        maxBombs: 6, range: 4, speed: 3,
        canKick: true, remoteDetonateCharges: 1, shield: true,
        pierce: true, canThrow: true, bombPass: true,
        alive: false
      },
      rng,
      { booleanRatio: 1, cap: 5 }
    );
    expect(list.length).toBe(5);
    expect(list.filter((k) => k === "bomb-up").length).toBeGreaterThan(0);
    expect(list.filter((k) => k === "fire-up").length).toBeGreaterThan(0);
  });

  it("system spawns pickups at the death cell on alive: true → false", () => {
    const world = new World();
    setupBomber(world, "bomber.player.1", { maxBombs: 5, range: 3 });
    const sys = createKaboomDeathPickupDropSystem({ booleanRatio: 0 });
    sys.fixedUpdate!(ctx(world));
    expect(countDrops(world)).toBe(0);
    killBomber(world, "bomber.player.1");
    sys.fixedUpdate!(ctx(world));
    // 5/2=2 bomb-up + 3-1=2 / 2 = 1 fire-up = 3 drops.
    expect(countDropsOfKind(world, "bomb-up")).toBe(2);
    expect(countDropsOfKind(world, "fire-up")).toBe(1);
  });

  it("dropped pickups land at the bomber's GridPosition", () => {
    const world = new World();
    setupBomber(world, "bomber.player.1", { maxBombs: 5 });
    const sys = createKaboomDeathPickupDropSystem({ booleanRatio: 0 });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "bomber.player.1");
    sys.fixedUpdate!(ctx(world));
    for (const id of world.entityIds()) {
      if (!id.includes(".drop.")) continue;
      const gp = world.getComponent<{ gx?: number; gz?: number }>(id, "GridPosition");
      expect(gp?.gx).toBe(4);
      expect(gp?.gz).toBe(7);
    }
  });

  it("?lootDrop=off equivalent (disabled:true) → no drops on death", () => {
    const world = new World();
    setupBomber(world, "bomber.player.1", { maxBombs: 5, range: 3, canKick: true });
    const sys = createKaboomDeathPickupDropSystem({ disabled: true });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "bomber.player.1");
    sys.fixedUpdate!(ctx(world));
    expect(countDrops(world)).toBe(0);
  });

  it("each bomber id drops once — re-triggering the same alive=false doesn't double-spawn", () => {
    const world = new World();
    setupBomber(world, "bomber.player.1", { maxBombs: 3 });
    const sys = createKaboomDeathPickupDropSystem({ booleanRatio: 0 });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "bomber.player.1");
    sys.fixedUpdate!(ctx(world));
    const after = countDrops(world);
    sys.fixedUpdate!(ctx(world));
    expect(countDrops(world)).toBe(after);
  });

  it("loot-drop-decay system despawns drops after lifetime expires", () => {
    const world = new World();
    setupBomber(world, "bomber.player.1", { maxBombs: 3 });
    const dropSys = createKaboomDeathPickupDropSystem({ booleanRatio: 0, lifetimeS: 0.5 });
    const decaySys = createKaboomLootDropDecaySystem();
    dropSys.fixedUpdate!(ctx(world));
    killBomber(world, "bomber.player.1");
    dropSys.fixedUpdate!(ctx(world));
    expect(countDrops(world)).toBeGreaterThan(0);
    // 40 ticks at 1/60s = 0.67s > 0.5s lifetime.
    for (let i = 0; i < 40; i += 1) decaySys.fixedUpdate!(ctx(world));
    expect(countDrops(world)).toBe(0);
  });

  it("default constants exposed for bootstrap", () => {
    expect(LOOT_DROP_CAP_DEFAULT).toBeGreaterThanOrEqual(1);
    expect(LOOT_DROP_LIFETIME_S_DEFAULT).toBeGreaterThan(0);
    expect(LOOT_DROP_BOOLEAN_RATIO_DEFAULT).toBeGreaterThanOrEqual(0);
    expect(LOOT_DROP_BOOLEAN_RATIO_DEFAULT).toBeLessThanOrEqual(1);
  });
});
