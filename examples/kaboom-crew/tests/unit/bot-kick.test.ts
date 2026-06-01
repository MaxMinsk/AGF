// S220 KABOOM-BOT-TACTICAL-KICK (GDP-2026-05-29-009 KICK slice).
// Covers the bot AI side: when a bot has canKick + an own bomb in
// some cardinal + an alive enemy 2..6 cells beyond, the bot's
// queued direction points INTO the bomb so the existing
// bomb-kick-system (which lost its PLAYER_CONTROLLED filter) slides
// the bomb forward.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";

import { createKaboomBotAISystem } from "../../src/systems/bot-ai-system";
import { createKaboomBombKickSystem } from "../../src/systems/bomb-kick-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

type Direction = { dx: number; dz: number };

const NEVER_BLOCK = {
  blocked: () => false,
  occupants: (gx: number, gz: number, _layer?: string): string[] => {
    const out: string[] = [];
    // Walk every bomb/bomber in `world` (passed via closure below).
    // Tests fill this via mutateOccupancyForWorld; the helper here
    // is replaced by tests when they need an occupant lookup.
    void gx; void gz; void _layer;
    return out;
  },
  occupiedCells: () => [] as Array<{ gx: number; gz: number }>
} as unknown as Parameters<typeof createKaboomBotAISystem>[0]["occupancy"];

/** Stub occupancy that looks up "bomb"-layer occupants from the
 *  given world. Movement-blocked is uniformly false (tests put
 *  enemies on cells the bot can probe through). */
function occupancyForWorld(world: World): Parameters<typeof createKaboomBotAISystem>[0]["occupancy"] {
  return {
    blocked: () => false,
    occupants: (gx: number, gz: number, layer?: string): string[] => {
      const out: string[] = [];
      for (const id of world.entityIds()) {
        const gp = world.getComponent<{ gx?: number; gz?: number }>(id, "GridPosition");
        if (gp?.gx !== gx || gp.gz !== gz) continue;
        if (layer === "bomb" && world.hasComponent(id, "Bomb")) out.push(id);
        else if (layer === undefined) out.push(id);
      }
      return out;
    },
    occupiedCells: () => [] as Array<{ gx: number; gz: number }>
  } as unknown as Parameters<typeof createKaboomBotAISystem>[0]["occupancy"];
}

function setupBot(world: World, id: string, gx: number, gz: number, canKick: boolean): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive: true, canKick });
  world.setComponent(id, "GridMover", { speed: 1 });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "BotBrain", { aggression: 0.3, personality: "hunter", nextDecisionIn: 0 });
}

function setupEnemy(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive: true });
  world.setComponent(id, "GridMover", { speed: 1 });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "PlayerControlled", {});
}

function setupBomb(world: World, id: string, gx: number, gz: number, owner: string): void {
  world.addEntity(id);
  world.setComponent(id, "Bomb", { fuseRemaining: 2.5, range: 2, ownerId: owner });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.35, gz], rotation: [0, 0, 0], scale: [1, 1, 1] });
}

function moverDir(world: World, id: string): Direction | undefined {
  const m = world.getComponent<{ queuedDirection?: Direction }>(id, "GridMover");
  return m?.queuedDirection;
}

describe("kaboom bot tactical kick (S220)", () => {
  it("bot with canKick + own bomb E + enemy 3 cells E → queued direction = E (+1, 0)", () => {
    const world = new World();
    setupBot(world, "bot.1", 3, 5, true);
    setupBomb(world, "bot.1.bomb", 4, 5, "bot.1");
    setupEnemy(world, "player.1", 6, 5);
    const occupancy = occupancyForWorld(world);
    const sys = createKaboomBotAISystem({ occupancy, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    expect(moverDir(world, "bot.1")).toEqual({ dx: 1, dz: 0 });
  });

  it("bot WITHOUT canKick + same setup → does NOT walk INTO own bomb", () => {
    const world = new World();
    setupBot(world, "bot.1", 3, 5, false);
    setupBomb(world, "bot.1.bomb", 4, 5, "bot.1");
    setupEnemy(world, "player.1", 6, 5);
    const occupancy = occupancyForWorld(world);
    const sys = createKaboomBotAISystem({ occupancy, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    expect(moverDir(world, "bot.1")).not.toEqual({ dx: 1, dz: 0 });
  });

  it("bot with canKick + bomb E but NO enemy beyond → does not force E", () => {
    const world = new World();
    setupBot(world, "bot.1", 3, 5, true);
    setupBomb(world, "bot.1.bomb", 4, 5, "bot.1");
    // No enemy in line of sight.
    const occupancy = occupancyForWorld(world);
    const sys = createKaboomBotAISystem({ occupancy, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    // Direction may be anything other than EAST (the kick override
    // didn't fire). Allow zero-vector too (no goal, no danger).
    const d = moverDir(world, "bot.1");
    expect(d).toBeDefined();
    expect(!(d!.dx === 1 && d!.dz === 0)).toBe(true);
  });

  it("bot with canKick + own bomb N + enemy 4 cells N → queued direction = N (0, -1)", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, true);
    setupBomb(world, "bot.1.bomb", 5, 4, "bot.1");
    setupEnemy(world, "player.1", 5, 1);
    const occupancy = occupancyForWorld(world);
    const sys = createKaboomBotAISystem({ occupancy, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    expect(moverDir(world, "bot.1")).toEqual({ dx: 0, dz: -1 });
  });

  it("kick mechanism (bomb-kick-system) now works for bot bombers too — no PlayerControlled gate", () => {
    const world = new World();
    setupBot(world, "bot.1", 3, 5, true);
    setupBomb(world, "bot.1.bomb", 4, 5, "bot.1");
    // Mover already at idle (currentLerp = 0).
    world.setComponent("bot.1", "GridMover", { speed: 1, queuedDirection: { dx: 1, dz: 0 } });
    const occupancy = occupancyForWorld(world);
    const sys = createKaboomBombKickSystem({ occupancy });
    sys.fixedUpdate!(ctx(world));
    // The bomb's GridPosition should slide one cell east.
    const gp = world.getComponent<{ gx?: number; gz?: number }>("bot.1.bomb", "GridPosition");
    expect(gp?.gx).toBe(5);
    expect(gp?.gz).toBe(5);
  });
});

// agf-allow:unused — keep NEVER_BLOCK reference so the unused-export
// lint stays quiet while we keep the helper around as an option for
// follow-up tests that don't need world-aware occupancy.
void NEVER_BLOCK;
