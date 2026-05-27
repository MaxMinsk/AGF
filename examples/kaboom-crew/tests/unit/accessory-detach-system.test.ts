// S162 KABOOM-ACCESSORY-DETACH unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  __ACCESSORY_DETACH_CONSTANTS,
  computeScatterImpulse,
  createKaboomAccessoryDetachSystem,
  DEFAULT_ACCESSORY_SCATTER,
  scatterSeedHash
} from "../../src/systems/accessory-detach-system";

const FIXED_DT = 1 / 60;
function ctx(world: World, fixedDt = FIXED_DT) {
  return { world, time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 } };
}

function addBomber(world: World, id: string, gx: number, gz: number, alive = true): void {
  world.addEntity(id);
  world.setComponent(id, "Transform", { position: [gx, 0.5, gz], rotation: [0, 0, 0], scale: [1, 1, 1] });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive });
}

function addAccessory(world: World, bomberId: string, slot: number, kind: string, parent: string): string {
  const id = `${bomberId}.accessory${slot}.${kind}`;
  world.addEntity(id);
  world.setComponent(id, "Transform", { parent, position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  return id;
}

describe("scatterSeedHash (S162 pure helper)", () => {
  it("is deterministic per (rootId, kind)", () => {
    const a = scatterSeedHash("player.1", "antennae");
    const b = scatterSeedHash("player.1", "antennae");
    expect(a).toBe(b);
  });
  it("differs across rootIds", () => {
    expect(scatterSeedHash("player.1", "cap")).not.toBe(scatterSeedHash("bot.1", "cap"));
  });
  it("differs across kinds", () => {
    expect(scatterSeedHash("player.1", "cap")).not.toBe(scatterSeedHash("player.1", "fins"));
  });
});

describe("computeScatterImpulse (S162 pure helper)", () => {
  it("zero blast direction (self-bomb) → random horizontal kick + vertical bias", () => {
    const cfg = { ...DEFAULT_ACCESSORY_SCATTER.cap, bombDirectionalBias: 0 };
    const imp = computeScatterImpulse(0, 0, cfg, scatterSeedHash("p", "cap"));
    // Vertical bias positive.
    expect(imp.vy).toBeGreaterThan(0);
  });
  it("blast east → backpack (negative bias) flies WEST", () => {
    const cfg = DEFAULT_ACCESSORY_SCATTER.backpack;
    // Bomber at (5,5), blast at (4,5) → blastDir = (1, 0) (east of blast).
    const imp = computeScatterImpulse(1, 0, cfg, scatterSeedHash("p", "backpack"));
    // bombDirectionalBias = -0.8, so velocity should be in -X (west).
    expect(imp.vx).toBeLessThan(0);
  });
  it("blast east → antennae (positive bias) flies EAST", () => {
    const cfg = DEFAULT_ACCESSORY_SCATTER.antennae;
    const imp = computeScatterImpulse(1, 0, cfg, scatterSeedHash("p", "antennae"));
    expect(imp.vx).toBeGreaterThanOrEqual(0);
  });
  it("output is reproducible for identical (blastDir, cfg, seed)", () => {
    const cfg = DEFAULT_ACCESSORY_SCATTER.fins;
    const seed = scatterSeedHash("p", "fins");
    const a = computeScatterImpulse(1, 0, cfg, seed);
    const b = computeScatterImpulse(1, 0, cfg, seed);
    expect(a).toEqual(b);
  });
});

describe("createKaboomAccessoryDetachSystem (S162)", () => {
  it("dead bomber: AccessoryDebris spawned on each accessory entity", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, false);
    const a1 = addAccessory(world, "player.1", 0, "antennae", "player.1");
    const a2 = addAccessory(world, "player.1", 1, "cap", "player.1");
    const sys = createKaboomAccessoryDetachSystem();
    sys.fixedUpdate!(ctx(world));
    expect(world.hasComponent(a1, "AccessoryDebris")).toBe(true);
    expect(world.hasComponent(a2, "AccessoryDebris")).toBe(true);
    expect(world.hasComponent("player.1", "AccessoryDetachFired")).toBe(true);
  });

  it("alive bomber: no AccessoryDebris stamped", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, true);
    const a1 = addAccessory(world, "player.1", 0, "fins", "player.1");
    const sys = createKaboomAccessoryDetachSystem();
    sys.fixedUpdate!(ctx(world));
    expect(world.hasComponent(a1, "AccessoryDebris")).toBe(false);
  });

  it("AccessoryDetachFired marker prevents re-fire", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, false);
    world.setComponent("player.1", "AccessoryDetachFired", {});
    const a1 = addAccessory(world, "player.1", 0, "visor", "player.1");
    const sys = createKaboomAccessoryDetachSystem();
    sys.fixedUpdate!(ctx(world));
    expect(world.hasComponent(a1, "AccessoryDebris")).toBe(false);
  });

  it("detached accessory has parent cleared", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, false);
    const a1 = addAccessory(world, "player.1", 0, "antennae", "player.1");
    const sys = createKaboomAccessoryDetachSystem();
    sys.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ parent?: string }>(a1, "Transform")!;
    expect(t.parent).toBeUndefined();
  });

  it("integration: Transform.position advances by velocity * dt; gravity drops vy", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, false);
    const a1 = addAccessory(world, "player.1", 0, "antennae", "player.1");
    // DeathImpulse from west → bomber.gx - origin.gx = 5 - 3 = 2 (east of blast).
    world.setComponent("player.1", "DeathImpulse", { blastOriginGx: 3, blastOriginGz: 5 });
    const sys = createKaboomAccessoryDetachSystem();
    sys.fixedUpdate!(ctx(world));
    const debrisBefore = world.getComponent<{ vx: number; vy: number; vz: number }>(a1, "AccessoryDebris")!;
    // Tick again — position should change.
    const tBefore = world.getComponent<{ position: ReadonlyArray<number> }>(a1, "Transform")!;
    const px = tBefore.position[0]!;
    const py = tBefore.position[1]!;
    sys.fixedUpdate!(ctx(world));
    const tAfter = world.getComponent<{ position: ReadonlyArray<number> }>(a1, "Transform")!;
    expect(tAfter.position[0]).not.toBe(px);
    // Some bias on Y, gravity hasn't pulled below baseline yet.
    expect(tAfter.position[1]).not.toBe(py);
    // vy decreased (gravity).
    const debrisAfter = world.getComponent<{ vy: number }>(a1, "AccessoryDebris")!;
    expect(debrisAfter.vy).toBeLessThan(debrisBefore.vy);
  });

  it("entity removed after lifetimeMs elapses", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, false);
    const a1 = addAccessory(world, "player.1", 0, "antennae", "player.1");
    const sys = createKaboomAccessoryDetachSystem();
    sys.fixedUpdate!(ctx(world));
    // Force lifetime down so the test runs in a few ticks.
    const state = world.getComponent<Record<string, number>>(a1, "AccessoryDebris")!;
    world.setComponent(a1, "AccessoryDebris", { ...state, lifetimeMs: 50 });
    for (let i = 0; i < 10; i += 1) sys.fixedUpdate!(ctx(world));
    expect(world.hasEntity(a1)).toBe(false);
  });

  it("non-accessory id matching prefix is ignored", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, false);
    // Not an accessory id format — should be skipped.
    world.addEntity("player.1.torso");
    world.setComponent("player.1.torso", "Transform", { parent: "player.1", position: [0, 0.5, 0] });
    const sys = createKaboomAccessoryDetachSystem();
    sys.fixedUpdate!(ctx(world));
    expect(world.hasComponent("player.1.torso", "AccessoryDebris")).toBe(false);
  });

  it("unknown accessory kind skipped silently", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, false);
    const weird = addAccessory(world, "player.1", 0, "noseflute", "player.1");
    const sys = createKaboomAccessoryDetachSystem();
    sys.fixedUpdate!(ctx(world));
    expect(world.hasComponent(weird, "AccessoryDebris")).toBe(false);
  });

  it("SpringPivot + SoftAttached removed on detach", () => {
    const world = new World();
    addBomber(world, "player.1", 5, 5, false);
    const a1 = addAccessory(world, "player.1", 0, "antennae", "player.1");
    world.setComponent(a1, "SoftAttached", {});
    world.setComponent(a1, "SpringPivot", {});
    const sys = createKaboomAccessoryDetachSystem();
    sys.fixedUpdate!(ctx(world));
    expect(world.hasComponent(a1, "SoftAttached")).toBe(false);
    expect(world.hasComponent(a1, "SpringPivot")).toBe(false);
  });
});

describe("__ACCESSORY_DETACH_CONSTANTS", () => {
  it("export defaults are sensible (post-playtest tuning)", () => {
    // Live playtest 2026-05-27 said accessories flew too far — these
    // tightened defaults keep debris within ~1 tile of the bomber.
    expect(__ACCESSORY_DETACH_CONSTANTS.DEFAULT_LIFETIME_MS).toBe(1000);
    expect(__ACCESSORY_DETACH_CONSTANTS.DEFAULT_FADE_MS).toBe(250);
    expect(__ACCESSORY_DETACH_CONSTANTS.DEFAULT_GRAVITY).toBe(12);
  });
});
