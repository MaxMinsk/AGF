// S211 KABOOM-REVENGE (GDP-2026-05-30-002 V1). Covers the alive →
// false edge that initialises RevengeState, the request validation
// + bomb spawn path, cooldown ticking, bot auto-fire, and the
// round-restart edge that wipes the state.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";

import {
  REVENGE_BUDGET_DEFAULT,
  REVENGE_BOT_COOLDOWN_S_DEFAULT,
  REVENGE_COOLDOWN_S_DEFAULT,
  createKaboomRevengeSystem,
  nearestAliveBomberCell,
  pickRevengeLaunchEdge
} from "../../src/systems/revenge-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function setupBomber(
  world: World,
  id: string,
  gx: number,
  gz: number,
  options: { alive?: boolean; isBot?: boolean } = {}
): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", {
    maxBombs: 1,
    range: 2,
    alive: options.alive !== false
  });
  world.setComponent(id, "GridPosition", { gx, gz });
  if (options.isBot === true) {
    world.setComponent(id, "BotBrain", { aggression: 0.3, personality: "hunter", nextDecisionIn: 0 });
  }
}

function setupRoundState(world: World, phase = "playing", roundNumber = 1): void {
  if (!world.hasEntity("kaboom.round-state")) world.addEntity("kaboom.round-state");
  world.setComponent("kaboom.round-state", "RoundState", { phase, roundNumber });
}

function killBomber(world: World, id: string): void {
  const stats = world.getComponent("kaboom.game-state", "BomberStats") as Record<string, unknown> | undefined;
  void stats;
  const s = world.getComponent<Record<string, unknown>>(id, "BomberStats") ?? {};
  world.setComponent(id, "BomberStats", { ...s, alive: false });
}

function countRevengeBombs(world: World): number {
  let n = 0;
  for (const id of world.entityIds()) if (id.startsWith("revenge-bomb.")) n += 1;
  return n;
}

describe("kaboom revenge (S211)", () => {
  it("init: RevengeState appears on the alive: true → false edge", () => {
    const world = new World();
    setupBomber(world, "player.1", 3, 3);
    setupBomber(world, "bot.1", 8, 8, { isBot: true });
    setupRoundState(world);
    const sys = createKaboomRevengeSystem();
    sys.fixedUpdate!(ctx(world));
    expect(world.hasComponent("player.1", "RevengeState")).toBe(false);
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    const rs = world.getComponent("player.1", "RevengeState") as { bombsRemaining?: number; cooldownRemainingS?: number };
    expect(rs.bombsRemaining).toBe(REVENGE_BUDGET_DEFAULT);
    expect(rs.cooldownRemainingS).toBe(0);
  });

  it("disabled (?revenge=off) → no RevengeState is initialised on death", () => {
    const world = new World();
    setupBomber(world, "player.1", 3, 3);
    setupBomber(world, "bot.1", 8, 8);
    setupRoundState(world);
    const sys = createKaboomRevengeSystem({ disabled: true });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    expect(world.hasComponent("player.1", "RevengeState")).toBe(false);
  });

  it("RevengeBombRequest with valid state spawns a revenge bomb at the target cell", () => {
    const world = new World();
    setupBomber(world, "player.1", 3, 3);
    setupBomber(world, "bot.1", 8, 8);
    setupRoundState(world);
    const sys = createKaboomRevengeSystem();
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    world.setComponent("player.1", "RevengeBombRequest", { targetGx: 7, targetGz: 8 });
    sys.fixedUpdate!(ctx(world));
    expect(countRevengeBombs(world)).toBe(1);
    // Bomb lives at the target cell.
    for (const id of world.entityIds()) {
      if (!id.startsWith("revenge-bomb.")) continue;
      const gp = world.getComponent<{ gx?: number; gz?: number }>(id, "GridPosition");
      expect(gp?.gx).toBe(7);
      expect(gp?.gz).toBe(8);
      const bomb = world.getComponent<{ ownerId?: string; range?: number }>(id, "Bomb");
      expect(bomb?.ownerId).toBe("player.1");
      expect(bomb?.range).toBeGreaterThanOrEqual(1);
    }
    const rs = world.getComponent("player.1", "RevengeState") as { bombsRemaining?: number; cooldownRemainingS?: number };
    expect(rs.bombsRemaining).toBe(REVENGE_BUDGET_DEFAULT - 1);
    expect(rs.cooldownRemainingS).toBe(REVENGE_COOLDOWN_S_DEFAULT);
  });

  it("cooldown: a launch while cooldownRemainingS > 0 is rejected (no new bomb)", () => {
    const world = new World();
    setupBomber(world, "player.1", 3, 3);
    setupBomber(world, "bot.1", 8, 8);
    setupRoundState(world);
    const sys = createKaboomRevengeSystem();
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    world.setComponent("player.1", "RevengeBombRequest", { targetGx: 7, targetGz: 8 });
    sys.fixedUpdate!(ctx(world));
    expect(countRevengeBombs(world)).toBe(1);
    // Immediate retry while cooldown > 0.
    world.setComponent("player.1", "RevengeBombRequest", { targetGx: 9, targetGz: 8 });
    sys.fixedUpdate!(ctx(world));
    expect(countRevengeBombs(world)).toBe(1);
  });

  it("cap: 5 launches succeed, 6th is rejected (bombsRemaining = 0)", () => {
    const world = new World();
    setupBomber(world, "player.1", 3, 3);
    setupBomber(world, "bot.1", 8, 8);
    setupRoundState(world);
    const sys = createKaboomRevengeSystem({ cooldownS: 0 });
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    for (let i = 0; i < 6; i += 1) {
      world.setComponent("player.1", "RevengeBombRequest", { targetGx: 7 + i, targetGz: 8 });
      sys.fixedUpdate!(ctx(world));
    }
    expect(countRevengeBombs(world)).toBe(REVENGE_BUDGET_DEFAULT);
  });

  it("cooldown ticks down per fixedUpdate dt", () => {
    const world = new World();
    setupBomber(world, "player.1", 3, 3);
    setupBomber(world, "bot.1", 8, 8);
    setupRoundState(world);
    const sys = createKaboomRevengeSystem();
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    world.setComponent("player.1", "RevengeBombRequest", { targetGx: 7, targetGz: 8 });
    sys.fixedUpdate!(ctx(world));
    // Tick once at 1s dt.
    sys.fixedUpdate!(ctx(world, 1));
    const rs = world.getComponent("player.1", "RevengeState") as { cooldownRemainingS?: number };
    expect(rs.cooldownRemainingS).toBeCloseTo(REVENGE_COOLDOWN_S_DEFAULT - 1, 3);
  });

  it("S219: bot auto-fire is now ON by default — dead bot spawns a revenge bomb at the alive opponent's cell", () => {
    const world = new World();
    setupBomber(world, "player.1", 3, 3);
    setupBomber(world, "bot.1", 8, 8, { isBot: true });
    setupRoundState(world);
    const sys = createKaboomRevengeSystem();
    killBomber(world, "bot.1");
    sys.fixedUpdate!(ctx(world));
    sys.fixedUpdate!(ctx(world));
    expect(countRevengeBombs(world)).toBe(1);
  });

  it("explicit botAutoFire:false disables auto-fire (the V1 manual-only mode)", () => {
    const world = new World();
    setupBomber(world, "player.1", 3, 3);
    setupBomber(world, "bot.1", 8, 8, { isBot: true });
    setupRoundState(world);
    const sys = createKaboomRevengeSystem({ botAutoFire: false });
    killBomber(world, "bot.1");
    for (let i = 0; i < 30; i += 1) sys.fixedUpdate!(ctx(world));
    expect(countRevengeBombs(world)).toBe(0);
  });

  it("bot auto-fire (botAutoFire:true): dead bot with cooldown=0 spawns revenge bomb at nearest alive bomber", () => {
    const world = new World();
    setupBomber(world, "player.1", 3, 3);
    setupBomber(world, "bot.1", 8, 8, { isBot: true });
    setupRoundState(world);
    const sys = createKaboomRevengeSystem({ botAutoFire: true });
    killBomber(world, "bot.1");
    sys.fixedUpdate!(ctx(world));
    sys.fixedUpdate!(ctx(world));
    expect(countRevengeBombs(world)).toBe(1);
    for (const id of world.entityIds()) {
      if (!id.startsWith("revenge-bomb.")) continue;
      const gp = world.getComponent<{ gx?: number; gz?: number }>(id, "GridPosition");
      expect(gp?.gx).toBe(3);
      expect(gp?.gz).toBe(3);
    }
    const rs = world.getComponent("bot.1", "RevengeState") as { cooldownRemainingS?: number };
    // Spawned then ticked by one dt within the same fixedUpdate, so
    // we expect cooldown ≈ default - dt.
    expect(rs.cooldownRemainingS).toBeCloseTo(REVENGE_BOT_COOLDOWN_S_DEFAULT, 1);
  });

  it("round restart edge wipes RevengeState (bombsRemaining resets next round)", () => {
    const world = new World();
    setupBomber(world, "player.1", 3, 3);
    setupBomber(world, "bot.1", 8, 8);
    setupRoundState(world, "playing", 1);
    const sys = createKaboomRevengeSystem();
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    expect(world.hasComponent("player.1", "RevengeState")).toBe(true);
    // Round resolves, then restarts.
    setupRoundState(world, "won", 1);
    sys.fixedUpdate!(ctx(world));
    setupRoundState(world, "playing", 2);
    sys.fixedUpdate!(ctx(world));
    expect(world.hasComponent("player.1", "RevengeState")).toBe(false);
  });

  it("nearestAliveBomberCell ignores self + dead bombers", () => {
    const world = new World();
    setupBomber(world, "player.1", 1, 1);
    setupBomber(world, "bot.1", 5, 5);
    setupBomber(world, "bot.2", 10, 10);
    // Kill bot.2 so it doesn't get picked up.
    const s = world.getComponent<Record<string, unknown>>("bot.2", "BomberStats") ?? {};
    world.setComponent("bot.2", "BomberStats", { ...s, alive: false });
    const t = nearestAliveBomberCell(world, "player.1");
    expect(t).toEqual({ gx: 5, gz: 5 });
  });

  it("S219 pickRevengeLaunchEdge: 14×10 arena, target near N edge → launch at gz = -1", () => {
    expect(pickRevengeLaunchEdge(7, 1, { width: 14, depth: 10 })).toEqual({ gx: 7, gz: -1 });
  });

  it("S219 pickRevengeLaunchEdge: 14×10 arena, target near S edge → launch at gz = depth", () => {
    expect(pickRevengeLaunchEdge(7, 8, { width: 14, depth: 10 })).toEqual({ gx: 7, gz: 10 });
  });

  it("S219 pickRevengeLaunchEdge: 14×10 arena, target near W edge → launch at gx = -1", () => {
    expect(pickRevengeLaunchEdge(1, 5, { width: 14, depth: 10 })).toEqual({ gx: -1, gz: 5 });
  });

  it("S219 pickRevengeLaunchEdge: 14×10 arena, target near E edge → launch at gx = width", () => {
    expect(pickRevengeLaunchEdge(12, 5, { width: 14, depth: 10 })).toEqual({ gx: 14, gz: 5 });
  });

  it("S219 pickRevengeLaunchEdge: undefined arena bounds → fallback offset toward -Z", () => {
    expect(pickRevengeLaunchEdge(7, 5, undefined)).toEqual({ gx: 7, gz: 1 });
  });

  it("S219 revenge bomb spawns in airborne state with arc tween (target snapped to landing cell)", () => {
    const world = new World();
    setupBomber(world, "player.1", 3, 3);
    setupBomber(world, "bot.1", 8, 8);
    setupRoundState(world);
    const sys = createKaboomRevengeSystem({ botAutoFire: false });
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    world.setComponent("player.1", "RevengeBombRequest", { targetGx: 7, targetGz: 8 });
    sys.fixedUpdate!(ctx(world));
    let bombId: string | undefined;
    for (const id of world.entityIds()) if (id.startsWith("revenge-bomb.")) bombId = id;
    expect(bombId).toBeDefined();
    const bomb = world.getComponent<{ airborne?: boolean; airborneRemaining?: number; ownerId?: string }>(bombId!, "Bomb");
    expect(bomb?.airborne).toBe(true);
    expect(bomb?.airborneRemaining).toBeGreaterThan(0);
    expect(bomb?.ownerId).toBe("player.1");
    // GridPosition snaps to the landing cell immediately (per the
    // throw-glove convention so blast walker + chain detection see
    // the bomb at the right cell when the fuse fires post-landing).
    const gp = world.getComponent<{ gx?: number; gz?: number }>(bombId!, "GridPosition");
    expect(gp?.gx).toBe(7);
    expect(gp?.gz).toBe(8);
    // Tween targets `position` (not `scale` — V1 used a pop-in).
    const tweens = world.getComponent<ReadonlyArray<{ property?: string }>>(bombId!, "Tweens") ?? [];
    expect(tweens.some((t) => t.property === "position")).toBe(true);
  });
});
