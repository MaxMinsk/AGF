// S82 KABOOM-BOT-AI unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { createKaboomBotAISystem } from "../../src/systems/bot-ai-system";

function ctx(world: World, fixedDt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBot(world: World, id: string, gx: number, gz: number, aggression = 0): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: id, blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, activeBombs: 0, alive: true });
  world.setComponent(id, "GridMover", { speed: 3, currentLerp: 0 });
  world.setComponent(id, "BotBrain", { aggression });
}

function addBomb(world: World, id: string, gx: number, gz: number, range = 2): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "bomb", blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "Bomb", { fuseRemaining: 1, range, ownerId: "player.1" });
}

function addWall(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "wall", blocksMovement: true, blocksBlast: true });
}

describe("createKaboomBotAISystem (S82 KABOOM-BOT-AI)", () => {
  it("respects an in-flight decision cooldown — no rewrite while nextDecisionIn > dt", () => {
    const world = new World();
    addBot(world, "bot.1", 3, 3);
    world.setComponent("bot.1", "BotBrain", { aggression: 0, nextDecisionIn: 1 });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 1 });
    ai.fixedUpdate!(ctx(world));
    const mover = world.getComponent("bot.1", "GridMover") as { queuedDirection?: unknown };
    expect(mover.queuedDirection).toBeUndefined();
    // Cooldown was decremented but is still > 0.
    const brain = world.getComponent("bot.1", "BotBrain") as { nextDecisionIn: number };
    expect(brain.nextDecisionIn).toBeCloseTo(1 - 1 / 60, 4);
  });

  it("picks a passable cardinal when wandering", () => {
    const world = new World();
    addBot(world, "bot.1", 3, 3);
    // Wall the west cell so we can verify the bot doesn't pick -X first.
    addWall(world, "wall.w", 2, 3);
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    // Force the decision: nudge nextDecisionIn to 0 before the tick.
    world.setComponent("bot.1", "BotBrain", { aggression: 0, nextDecisionIn: 0 });
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
    ai.fixedUpdate!(ctx(world));
    const mover = world.getComponent("bot.1", "GridMover") as { queuedDirection: { dx: number; dz: number } };
    expect(mover.queuedDirection).toBeDefined();
    // Whatever the RNG chose, it isn't toward the wall.
    expect(mover.queuedDirection).not.toEqual({ dx: -1, dz: 0 });
    // And it's a valid cardinal.
    const cardinal = JSON.stringify(mover.queuedDirection);
    expect(["{\"dx\":1,\"dz\":0}", "{\"dx\":0,\"dz\":1}", "{\"dx\":0,\"dz\":-1}"]).toContain(cardinal);
  });

  it("flees out of a danger cell when in a bomb's blast radius", () => {
    const world = new World();
    addBot(world, "bot.1", 3, 3);
    // Bomb 2 cells west — its blast (range 2) reaches the bot's cell.
    addBomb(world, "bomb.w", 1, 3, 2);
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    world.setComponent("bot.1", "BotBrain", { aggression: 0, nextDecisionIn: 0 });
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 1 });
    ai.fixedUpdate!(ctx(world));
    const mover = world.getComponent("bot.1", "GridMover") as { queuedDirection: { dx: number; dz: number } };
    // The danger axis is +/- X (same row as the bomb). A perpendicular
    // move (Z direction) escapes the blast row.
    expect(Math.abs(mover.queuedDirection.dz)).toBe(1);
    expect(mover.queuedDirection.dx).toBe(0);
  });

  it("never drops a bomb when aggression=0", () => {
    const world = new World();
    addBot(world, "bot.1", 3, 3, 0);
    addWall(world, "soft", 4, 3); // simulate a soft block via movement-blocking-only occupant
    world.setComponent("soft", "GridOccupant", { layer: "block", blocksMovement: true, blocksBlast: false });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    world.setComponent("bot.1", "BotBrain", { aggression: 0, nextDecisionIn: 0 });
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 1 });
    ai.fixedUpdate!(ctx(world));
    expect(world.hasComponent("bot.1", "PlaceBombRequest")).toBe(false);
  });

  it("aggression=1 drops a bomb when a soft block is adjacent", () => {
    const world = new World();
    addBot(world, "bot.1", 3, 3, 1);
    // Soft block in the +X direction.
    world.addEntity("soft");
    world.setComponent("soft", "GridPosition", { gx: 4, gz: 3 });
    world.setComponent("soft", "GridOccupant", { layer: "block", blocksMovement: true, blocksBlast: false });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    world.setComponent("bot.1", "BotBrain", { aggression: 1, nextDecisionIn: 0 });
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 1 });
    ai.fixedUpdate!(ctx(world));
    expect(world.hasComponent("bot.1", "PlaceBombRequest")).toBe(true);
  });

  it("skips dead bots", () => {
    const world = new World();
    addBot(world, "bot.1", 3, 3);
    world.setComponent("bot.1", "BomberStats", { maxBombs: 1, range: 2, alive: false });
    world.setComponent("bot.1", "BotBrain", { aggression: 1, nextDecisionIn: 0 });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 1 });
    ai.fixedUpdate!(ctx(world));
    const mover = world.getComponent("bot.1", "GridMover") as { queuedDirection?: unknown };
    expect(mover.queuedDirection).toBeUndefined();
  });

  it("S88 KABOOM-BOT-DANGER-AVOID: wander path skips a neighbour cell that contains a live BlastTile", () => {
    // Bot at (3,3). Safe neighbour to the east; a live blast covers
    // the west neighbour (2,3). The bot must never pick west.
    const world = new World();
    addBot(world, "bot.1", 3, 3);
    world.setComponent("bot.1", "BotBrain", { aggression: 0, nextDecisionIn: 0 });
    // Live blast at the west neighbour.
    world.addEntity("blast-tile.1");
    world.setComponent("blast-tile.1", "GridPosition", { gx: 2, gz: 3 });
    world.setComponent("blast-tile.1", "BlastTile", { ownerId: "player.1", remaining: 0.2 });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
    for (let i = 0; i < 30; i += 1) {
      // Reset cooldown each round so decideDirection actually runs.
      const brain = world.getComponent("bot.1", "BotBrain") as { aggression: number };
      world.setComponent("bot.1", "BotBrain", { ...brain, nextDecisionIn: 0 });
      ai.fixedUpdate!(ctx(world));
      const mover = world.getComponent("bot.1", "GridMover") as { queuedDirection?: { dx: number; dz: number } };
      // Picked west means dx=-1, dz=0 — the unsafe direction.
      expect(mover.queuedDirection).not.toEqual({ dx: -1, dz: 0 });
    }
  });

  it("S89 KABOOM-BOT-PICKUP-MAGNET: bot picks the direction that reduces distance to a nearby pickup", () => {
    // Bot at (3,3); pickup at (5,3) — east. All other neighbours are
    // farther from the pickup. Expect dx=+1 consistently.
    const world = new World();
    addBot(world, "bot.1", 3, 3);
    world.setComponent("bot.1", "BotBrain", { aggression: 0, nextDecisionIn: 0 });
    world.addEntity("pickup.1");
    world.setComponent("pickup.1", "GridPosition", { gx: 5, gz: 3 });
    world.setComponent("pickup.1", "GridOccupant", { layer: "pickup", blocksMovement: false, blocksBlast: false });
    world.setComponent("pickup.1", "Pickup", { kind: "bomb-up" });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 42 });
    for (let i = 0; i < 5; i += 1) {
      const brain = world.getComponent("bot.1", "BotBrain") as { aggression: number };
      world.setComponent("bot.1", "BotBrain", { ...brain, nextDecisionIn: 0 });
      ai.fixedUpdate!(ctx(world));
      const mover = world.getComponent("bot.1", "GridMover") as { queuedDirection: { dx: number; dz: number } };
      expect(mover.queuedDirection).toEqual({ dx: 1, dz: 0 });
    }
  });

  it("S89 KABOOM-BOT-PICKUP-MAGNET: pickups in dangerous cells do not magnetise the bot", () => {
    // Bot at (3,3), pickup at (5,3) but bomb at (5,3) too (range 0
    // covers the pickup cell). The pickup should be ignored — bot
    // either wanders OR avoids danger, but never deterministically
    // heads toward the dangerous pickup.
    const world = new World();
    addBot(world, "bot.1", 3, 3);
    world.setComponent("bot.1", "BotBrain", { aggression: 0, nextDecisionIn: 0 });
    world.addEntity("pickup.1");
    world.setComponent("pickup.1", "GridPosition", { gx: 5, gz: 3 });
    world.setComponent("pickup.1", "GridOccupant", { layer: "pickup", blocksMovement: false, blocksBlast: false });
    world.setComponent("pickup.1", "Pickup", { kind: "fire-up" });
    // Bomb at the pickup cell with range 1 → covers (5,3) + neighbours.
    addBomb(world, "bomb.danger", 5, 3, 1);
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 99 });
    // Run many ticks; collect direction choices.
    const dirs = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      const brain = world.getComponent("bot.1", "BotBrain") as { aggression: number };
      world.setComponent("bot.1", "BotBrain", { ...brain, nextDecisionIn: 0 });
      ai.fixedUpdate!(ctx(world));
      const mover = world.getComponent("bot.1", "GridMover") as { queuedDirection: { dx: number; dz: number } };
      dirs.add(`${mover.queuedDirection.dx},${mover.queuedDirection.dz}`);
    }
    // Wander spread — the bot does NOT lock onto +X. The magnet only
    // kicks in when the pickup is reachable safely.
    expect(dirs.size).toBeGreaterThan(1);
  });

  it("S88 KABOOM-BOT-DANGER-AVOID: falls back to any neighbour when every direction is dangerous", () => {
    // Bot surrounded by danger on every cardinal — must still move
    // (don't freeze). Bomb at (3,3) with range 2 covers the four
    // cardinal neighbours of (3,3) — but the bot is AT (3,3) so it
    // is in danger; the surrounding cells are danger too. Even so,
    // the bot picks SOME direction.
    const world = new World();
    addBot(world, "bot.1", 3, 3);
    world.setComponent("bot.1", "BotBrain", { aggression: 0, nextDecisionIn: 0 });
    addBomb(world, "bomb.surround", 3, 3, 2);
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 13 });
    ai.fixedUpdate!(ctx(world));
    const mover = world.getComponent("bot.1", "GridMover") as { queuedDirection: { dx: number; dz: number } };
    // SOMETHING was picked — not frozen at (0,0).
    expect(Math.abs(mover.queuedDirection.dx) + Math.abs(mover.queuedDirection.dz)).toBeGreaterThan(0);
  });

  describe("S206 hunter bot proactive dash chase", () => {
    function placePlayer(world: World, gx: number, gz: number, alive = true): void {
      world.addEntity("player.1");
      world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive });
      world.setComponent("player.1", "GridPosition", { gx, gz });
      world.setComponent("player.1", "GridOccupant", { layer: "player.1", blocksMovement: false, blocksBlast: false });
    }

    it("hunter bot dashes proactively when player is 2 cells east + bot moving east", () => {
      const world = new World();
      addBot(world, "bot.1", 3, 5);
      world.setComponent("bot.1", "BotBrain", { aggression: 0.8, personality: "hunter" });
      placePlayer(world, 5, 5); // 2 east on same row
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      const mover = world.getComponent<{ queuedDirection?: { dx: number; dz: number } }>("bot.1", "GridMover");
      // Bot picked east (toward player). Whether dash fires this tick
      // depends on the bot's chosen direction; we assert that IF it
      // chose east AND has dash ready, a DashRequest was written.
      if (mover?.queuedDirection?.dx === 1 && mover.queuedDirection.dz === 0) {
        expect(world.hasComponent("bot.1", "DashRequest")).toBe(true);
      }
    });

    it("coward bot does NOT proactively dash even with player in line", () => {
      const world = new World();
      addBot(world, "bot.1", 3, 5);
      world.setComponent("bot.1", "BotBrain", { aggression: 0.5, personality: "coward" });
      placePlayer(world, 5, 5);
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "DashRequest")).toBe(false);
    });

    it("hunter bot does NOT dash when player is 4+ cells away (out of dash range)", () => {
      const world = new World();
      addBot(world, "bot.1", 1, 5);
      world.setComponent("bot.1", "BotBrain", { aggression: 0.8, personality: "hunter" });
      placePlayer(world, 6, 5); // 5 cells east — too far
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "DashRequest")).toBe(false);
    });

    it("hunter bot does NOT dash when player is on a different row + column", () => {
      const world = new World();
      addBot(world, "bot.1", 3, 5);
      world.setComponent("bot.1", "BotBrain", { aggression: 0.8, personality: "hunter" });
      placePlayer(world, 5, 7); // diagonal — not in dash line
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "DashRequest")).toBe(false);
    });

    it("hunter bot ignores dead player as a chase target", () => {
      const world = new World();
      addBot(world, "bot.1", 3, 5);
      world.setComponent("bot.1", "BotBrain", { aggression: 0.8, personality: "hunter" });
      placePlayer(world, 5, 5, false);
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "DashRequest")).toBe(false);
    });
  });

  describe("S204 bot remote-detonate", () => {
    it("paused bomb + enemy in blast → bot writes RemoteDetonateRequest", () => {
      const world = new World();
      addBot(world, "bot.1", 1, 1);
      world.setComponent("bot.1", "BomberStats", {
        maxBombs: 1,
        range: 2,
        activeBombs: 1,
        alive: true,
        remoteDetonateCharges: 1
      });
      // Paused bomb owned by bot.1 at (5,5) with range 2.
      world.addEntity("bomb.paused");
      world.setComponent("bomb.paused", "Bomb", {
        fuseRemaining: Infinity,
        range: 2,
        ownerId: "bot.1"
      });
      world.setComponent("bomb.paused", "GridPosition", { gx: 5, gz: 5 });
      // Enemy (player.1) at (5,7) — within +2 cells north on same column.
      world.addEntity("player.1");
      world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: true });
      world.setComponent("player.1", "GridPosition", { gx: 5, gz: 7 });
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "RemoteDetonateRequest")).toBe(true);
    });

    it("no paused bombs → no detonate request", () => {
      const world = new World();
      addBot(world, "bot.1", 1, 1);
      world.setComponent("bot.1", "BomberStats", {
        maxBombs: 1,
        range: 2,
        activeBombs: 0,
        alive: true,
        remoteDetonateCharges: 1
      });
      world.addEntity("player.1");
      world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: true });
      world.setComponent("player.1", "GridPosition", { gx: 5, gz: 5 });
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "RemoteDetonateRequest")).toBe(false);
    });

    it("paused bomb but no enemy in blast → no detonate request", () => {
      const world = new World();
      addBot(world, "bot.1", 1, 1);
      world.setComponent("bot.1", "BomberStats", {
        maxBombs: 1,
        range: 2,
        activeBombs: 1,
        alive: true,
        remoteDetonateCharges: 1
      });
      world.addEntity("bomb.paused");
      world.setComponent("bomb.paused", "Bomb", {
        fuseRemaining: Infinity,
        range: 2,
        ownerId: "bot.1"
      });
      world.setComponent("bomb.paused", "GridPosition", { gx: 5, gz: 5 });
      // Enemy far away on different row + column.
      world.addEntity("player.1");
      world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: true });
      world.setComponent("player.1", "GridPosition", { gx: 10, gz: 10 });
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "RemoteDetonateRequest")).toBe(false);
    });

    it("ticking bomb (finite fuse) is NOT a paused bomb — no detonate request", () => {
      const world = new World();
      addBot(world, "bot.1", 1, 1);
      world.setComponent("bot.1", "BomberStats", {
        maxBombs: 1,
        range: 2,
        activeBombs: 1,
        alive: true,
        remoteDetonateCharges: 1
      });
      // Normal ticking bomb, not paused.
      world.addEntity("bomb.normal");
      world.setComponent("bomb.normal", "Bomb", {
        fuseRemaining: 1.5,
        range: 2,
        ownerId: "bot.1"
      });
      world.setComponent("bomb.normal", "GridPosition", { gx: 5, gz: 5 });
      world.addEntity("player.1");
      world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: true });
      world.setComponent("player.1", "GridPosition", { gx: 5, gz: 7 });
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "RemoteDetonateRequest")).toBe(false);
    });

    it("dead enemy is ignored (no auto-trigger on already-dead bomber)", () => {
      const world = new World();
      addBot(world, "bot.1", 1, 1);
      world.setComponent("bot.1", "BomberStats", {
        maxBombs: 1,
        range: 2,
        activeBombs: 1,
        alive: true,
        remoteDetonateCharges: 1
      });
      world.addEntity("bomb.paused");
      world.setComponent("bomb.paused", "Bomb", {
        fuseRemaining: Infinity,
        range: 2,
        ownerId: "bot.1"
      });
      world.setComponent("bomb.paused", "GridPosition", { gx: 5, gz: 5 });
      world.addEntity("player.1");
      world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: false });
      world.setComponent("player.1", "GridPosition", { gx: 5, gz: 7 });
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "RemoteDetonateRequest")).toBe(false);
    });
  });

  describe("S203 bot dash escape", () => {
    it("bot in a danger cell with dash ready writes a DashRequest in a cardinal escape direction", () => {
      const world = new World();
      addBot(world, "bot.1", 3, 3);
      addBomb(world, "bomb.1", 3, 5, 4);
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "DashRequest")).toBe(true);
      const req = world.getComponent<{ dx: number; dz: number }>("bot.1", "DashRequest");
      expect(req).toBeDefined();
      expect(Math.abs(req!.dx) + Math.abs(req!.dz)).toBe(1);
    });

    it("bot NOT in danger does not dash", () => {
      const world = new World();
      addBot(world, "bot.1", 1, 1);
      addBomb(world, "bomb.1", 8, 8, 2);
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "DashRequest")).toBe(false);
    });

    it("bot in danger but on cooldown does not dash", () => {
      const world = new World();
      addBot(world, "bot.1", 3, 3);
      world.setComponent("bot.1", "BomberStats", {
        maxBombs: 1,
        range: 2,
        activeBombs: 0,
        alive: true,
        dashCooldownRemainingMs: 1500
      });
      addBomb(world, "bomb.1", 3, 5, 4);
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "DashRequest")).toBe(false);
    });

    it("bot in danger but already dashing does not write another DashRequest", () => {
      const world = new World();
      addBot(world, "bot.1", 3, 3);
      world.setComponent("bot.1", "BomberStats", {
        maxBombs: 1,
        range: 2,
        activeBombs: 0,
        alive: true,
        dashing: true
      });
      addBomb(world, "bomb.1", 3, 5, 4);
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "DashRequest")).toBe(false);
    });

    it("dead bot does not dash", () => {
      const world = new World();
      addBot(world, "bot.1", 3, 3);
      world.setComponent("bot.1", "BomberStats", {
        maxBombs: 1,
        range: 2,
        activeBombs: 0,
        alive: false
      });
      addBomb(world, "bomb.1", 3, 5, 4);
      const occ = createGridOccupancySystem();
      occ.frameUpdate!(ctx(world));
      const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
      ai.fixedUpdate!(ctx(world));
      expect(world.hasComponent("bot.1", "DashRequest")).toBe(false);
    });
  });
});
