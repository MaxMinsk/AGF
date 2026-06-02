// S224 KABOOM-BOT-TACTICAL-THROW (GDP-2026-05-29-009 THROW slice).
// Bot with canThrow standing on own bomb → 30 %/brain-tick emits
// PickupBombRequest. Once carrying (BomberStats.carryingBombId set),
// emits ThrowBombRequest. The existing bomb-pickup + bomb-throw
// systems handle the actual mechanics.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";

import { maybeFireBotThrow } from "../../src/systems/bot-ai-system";

function setupBot(
  world: World,
  id: string,
  gx: number,
  gz: number,
  canThrow: boolean,
  carryingBombId?: string
): void {
  world.addEntity(id);
  const stats: Record<string, unknown> = { maxBombs: 1, range: 2, alive: true, canThrow };
  if (typeof carryingBombId === "string") stats["carryingBombId"] = carryingBombId;
  world.setComponent(id, "BomberStats", stats);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridMover", { speed: 1 });
  world.setComponent(id, "BotBrain", { aggression: 0.0, personality: "hunter", nextDecisionIn: 0 });
}

function setupBomb(world: World, id: string, gx: number, gz: number, owner: string): void {
  world.addEntity(id);
  world.setComponent(id, "Bomb", { fuseRemaining: 2.5, range: 2, ownerId: owner });
  world.setComponent(id, "GridPosition", { gx, gz });
}

/** Deterministic RNG yielding the configured sequence (cycles back to
 *  the start when exhausted). */
function fixedRng(values: number[]): { next: () => number } {
  let i = 0;
  return {
    next: () => {
      const v = values[i % values.length]!;
      i += 1;
      return v;
    }
  };
}

describe("kaboom bot tactical throw (S224)", () => {
  it("bot canThrow + standing on own bomb + rng rolls 0.1 → PickupBombRequest{bombId}", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, true);
    setupBomb(world, "bot.1.bomb", 5, 5, "bot.1");
    maybeFireBotThrow(world, "bot.1", { gx: 5, gz: 5 }, fixedRng([0.1]));
    const req = world.getComponent<{ bombId?: string }>("bot.1", "PickupBombRequest");
    expect(req?.bombId).toBe("bot.1.bomb");
  });

  it("bot canThrow + own bomb + rng rolls 0.5 (above 30 %) → no PickupBombRequest", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, true);
    setupBomb(world, "bot.1.bomb", 5, 5, "bot.1");
    maybeFireBotThrow(world, "bot.1", { gx: 5, gz: 5 }, fixedRng([0.5]));
    expect(world.hasComponent("bot.1", "PickupBombRequest")).toBe(false);
  });

  it("bot WITHOUT canThrow + same setup → no PickupBombRequest", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, false);
    setupBomb(world, "bot.1.bomb", 5, 5, "bot.1");
    maybeFireBotThrow(world, "bot.1", { gx: 5, gz: 5 }, fixedRng([0.1]));
    expect(world.hasComponent("bot.1", "PickupBombRequest")).toBe(false);
  });

  it("bot canThrow on cell WITHOUT own bomb (only enemy bomb) → no PickupBombRequest", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, true);
    setupBomb(world, "enemy.bomb", 5, 5, "player.1");
    maybeFireBotThrow(world, "bot.1", { gx: 5, gz: 5 }, fixedRng([0.1]));
    expect(world.hasComponent("bot.1", "PickupBombRequest")).toBe(false);
  });

  it("bot ALREADY carrying (carryingBombId set) → emits ThrowBombRequest, ignores rng", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, true, "bot.1.bomb");
    setupBomb(world, "bot.1.bomb", 5, 5, "bot.1");
    maybeFireBotThrow(world, "bot.1", { gx: 5, gz: 5 }, fixedRng([0.9]));
    expect(world.hasComponent("bot.1", "ThrowBombRequest")).toBe(true);
    // Pickup not re-emitted while already carrying.
    expect(world.hasComponent("bot.1", "PickupBombRequest")).toBe(false);
  });

  it("dead bot (alive:false) — neither pickup nor throw fires", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, true);
    setupBomb(world, "bot.1.bomb", 5, 5, "bot.1");
    const s = world.getComponent<Record<string, unknown>>("bot.1", "BomberStats") ?? {};
    world.setComponent("bot.1", "BomberStats", { ...s, alive: false });
    maybeFireBotThrow(world, "bot.1", { gx: 5, gz: 5 }, fixedRng([0.1]));
    expect(world.hasComponent("bot.1", "PickupBombRequest")).toBe(false);
    expect(world.hasComponent("bot.1", "ThrowBombRequest")).toBe(false);
  });
});
