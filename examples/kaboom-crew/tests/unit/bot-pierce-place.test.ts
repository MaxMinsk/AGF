// S223 KABOOM-BOT-PIERCE-PLACE (GDP-2026-05-29-009 PIERCE slice).
// Bot with BomberStats.pierce === true commits to PlaceBombRequest
// when any cardinal has 2+ soft blocks in line. Recognises the
// pierce-bomb value pattern (one bomb clears two crates per S142).

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";

import {
  countSoftBlocksInLine,
  createKaboomBotAISystem
} from "../../src/systems/bot-ai-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

const NEVER_BLOCK = {
  blocked: () => false,
  occupants: () => [] as string[],
  occupiedCells: () => [] as Array<{ gx: number; gz: number }>
} as unknown as Parameters<typeof createKaboomBotAISystem>[0]["occupancy"];

/** Occupancy stub that flags a given list of cells as soft blocks
 *  (movement-blocked + non-blast-blocked) and leaves everything else
 *  passable. */
function occupancyWithSoftBlocks(softCells: Array<{ gx: number; gz: number }>): Parameters<typeof createKaboomBotAISystem>[0]["occupancy"] {
  const set = new Set(softCells.map((c) => `${c.gx},${c.gz}`));
  return {
    blocked: (gx: number, gz: number, layer: "movement" | "blast"): boolean => {
      const isSoft = set.has(`${gx},${gz}`);
      if (layer === "movement") return isSoft;
      return false; // soft blocks don't block blast
    },
    occupants: () => [] as string[],
    occupiedCells: () => [] as Array<{ gx: number; gz: number }>
  } as unknown as Parameters<typeof createKaboomBotAISystem>[0]["occupancy"];
}

function setupBot(world: World, id: string, gx: number, gz: number, pierce: boolean): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, activeBombs: 0, alive: true, pierce });
  world.setComponent(id, "GridMover", { speed: 1 });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "BotBrain", { aggression: 0.0, personality: "hunter", nextDecisionIn: 0 });
}

function hasPlaceRequest(world: World, id: string): boolean {
  return world.hasComponent(id, "PlaceBombRequest");
}

describe("kaboom bot tactical pierce (S223)", () => {
  it("countSoftBlocksInLine: 2 soft blocks east of centre → returns 2", () => {
    const occupancy = occupancyWithSoftBlocks([{ gx: 6, gz: 5 }, { gx: 7, gz: 5 }]);
    expect(countSoftBlocksInLine(occupancy as { blocked: (gx: number, gz: number, layer: "movement" | "blast") => boolean }, { gx: 5, gz: 5 }, { dx: 1, dz: 0 }, 4)).toBe(2);
  });

  it("countSoftBlocksInLine: 1 soft then empty → returns 1 (stops at first non-soft)", () => {
    const occupancy = occupancyWithSoftBlocks([{ gx: 6, gz: 5 }]);
    expect(countSoftBlocksInLine(occupancy as { blocked: (gx: number, gz: number, layer: "movement" | "blast") => boolean }, { gx: 5, gz: 5 }, { dx: 1, dz: 0 }, 4)).toBe(1);
  });

  it("countSoftBlocksInLine: no soft blocks → returns 0", () => {
    expect(countSoftBlocksInLine(NEVER_BLOCK as unknown as { blocked: (gx: number, gz: number, layer: "movement" | "blast") => boolean }, { gx: 5, gz: 5 }, { dx: 1, dz: 0 }, 4)).toBe(0);
  });

  it("countSoftBlocksInLine: cap respected — 5 soft in line but cap 2 → returns 2", () => {
    const cells = [6, 7, 8, 9, 10].map((gx) => ({ gx, gz: 5 }));
    const occupancy = occupancyWithSoftBlocks(cells);
    expect(countSoftBlocksInLine(occupancy as { blocked: (gx: number, gz: number, layer: "movement" | "blast") => boolean }, { gx: 5, gz: 5 }, { dx: 1, dz: 0 }, 2)).toBe(2);
  });

  it("bot with pierce + 2 soft blocks east → emits PlaceBombRequest (commits past dice)", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, true);
    const occupancy = occupancyWithSoftBlocks([{ gx: 6, gz: 5 }, { gx: 7, gz: 5 }]);
    const sys = createKaboomBotAISystem({ occupancy, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    expect(hasPlaceRequest(world, "bot.1")).toBe(true);
  });

  it("bot WITHOUT pierce + 2 soft east + aggression=0 → no commit (falls through to dice)", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, false);
    const occupancy = occupancyWithSoftBlocks([{ gx: 6, gz: 5 }, { gx: 7, gz: 5 }]);
    const sys = createKaboomBotAISystem({ occupancy, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    // Aggression is 0 (set in setupBot), so dice always fail → no place.
    expect(hasPlaceRequest(world, "bot.1")).toBe(false);
  });

  it("bot with pierce + only 1 soft east → falls back to standard adjacent-soft path", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, true);
    const occupancy = occupancyWithSoftBlocks([{ gx: 6, gz: 5 }]);
    const sys = createKaboomBotAISystem({ occupancy, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    // Single soft adjacent — pierce commit doesn't fire; aggression
    // dice (aggression=0) fail → no place.
    expect(hasPlaceRequest(world, "bot.1")).toBe(false);
  });
});
