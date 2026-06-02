// S242 — unit tests for the pure helpers extracted by the
// GDP-2026-06-02-002 refactor (S234 V0 → S241 V6). Locks the new
// contract so future bot-ai changes don't silently regress the
// helpers' inputs / outputs.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { cellKey } from "../../../../engine/core/grid";
import {
  buildBotDangerMap,
  botPassableNeighbours,
  decideBotShouldDropBomb,
  findBotKickOpportunity,
  nearestBotOtherBomber,
  nearestBotPickup,
  nearestBotPlayer,
  nearestBotSoftBlock,
  pickBotDirection,
  selectBotPersonalityGoal,
  type BotOccupancyQuery
} from "../../src/systems/bot-ai-helpers";

/** Minimal occupancy stub. Hard walls block both layers, soft blocks
 *  block movement only, plain cells (cellSet absent / not in any
 *  list) are passable. */
function makeOcc(opts: {
  hard?: ReadonlyArray<[number, number]>;
  soft?: ReadonlyArray<[number, number]>;
  bombs?: ReadonlyArray<{ gx: number; gz: number; id: string }>;
}): BotOccupancyQuery {
  const hardSet = new Set((opts.hard ?? []).map(([x, z]) => `${x},${z}`));
  const softSet = new Set((opts.soft ?? []).map(([x, z]) => `${x},${z}`));
  const bombsByCell = new Map<string, string[]>();
  for (const b of opts.bombs ?? []) {
    const k = `${b.gx},${b.gz}`;
    const arr = bombsByCell.get(k);
    if (arr === undefined) bombsByCell.set(k, [b.id]);
    else arr.push(b.id);
  }
  return {
    blocked: (gx, gz, layer) => {
      const k = `${gx},${gz}`;
      if (hardSet.has(k)) return true;
      if (layer === "movement" && softSet.has(k)) return true;
      return false;
    },
    occupants: (gx, gz, key) => {
      if (key === "bomb") return bombsByCell.get(`${gx},${gz}`) ?? [];
      return [];
    }
  };
}

/** Deterministic RNG: returns the next number from a queue. Easier
 *  to reason about than seededRng for pinpoint branch tests. */
function makeRng(values: number[]): { next: () => number } {
  let i = 0;
  return {
    next: () => {
      const v = values[i % values.length];
      i += 1;
      return v ?? 0;
    }
  };
}

describe("buildBotDangerMap", () => {
  it("marks the bomb's cell + every cardinal up to `range`", () => {
    const world = new World();
    world.addEntity("bomb.1");
    world.setComponent("bomb.1", "GridPosition", { gx: 3, gz: 3 });
    world.setComponent("bomb.1", "Bomb", { range: 2, fuseRemaining: 1, ownerId: "player.1" });
    const occ = makeOcc({});
    const danger = buildBotDangerMap(world, { occupancy: occ, bombs: { run: () => ["bomb.1"] } });
    expect(danger.has(cellKey(3, 3))).toBe(true); // origin
    expect(danger.has(cellKey(4, 3))).toBe(true); // +x step 1
    expect(danger.has(cellKey(5, 3))).toBe(true); // +x step 2
    expect(danger.has(cellKey(6, 3))).toBe(false); // beyond range
    expect(danger.has(cellKey(3, 5))).toBe(true); // +z step 2
    expect(danger.has(cellKey(3, 2))).toBe(true); // -z step 1
  });

  it("stops at hard walls and includes the soft-block cell but no further", () => {
    const world = new World();
    world.addEntity("bomb.1");
    world.setComponent("bomb.1", "GridPosition", { gx: 3, gz: 3 });
    world.setComponent("bomb.1", "Bomb", { range: 3, fuseRemaining: 1, ownerId: "player.1" });
    // Hard wall at (5, 3); blast stops BEFORE (5, 3).
    // Soft block at (3, 5); blast INCLUDES (3, 5), excludes (3, 6).
    // The soft-block-absorbs rule in `buildBotDangerMap` iterates
    // `occupants(gx, gz)` — the stop predicate needs at least one
    // occupant returned, so the cell must have something to iterate.
    const occ: BotOccupancyQuery = {
      blocked: (gx, gz, layer) => {
        if (gx === 5 && gz === 3) return true; // hard wall both layers
        if (gx === 3 && gz === 5 && layer === "movement") return true; // soft block
        return false;
      },
      occupants: (gx, gz) => (gx === 3 && gz === 5 ? ["soft.1"] : [])
    };
    const danger = buildBotDangerMap(world, { occupancy: occ, bombs: { run: () => ["bomb.1"] } });
    expect(danger.has(cellKey(4, 3))).toBe(true);
    expect(danger.has(cellKey(5, 3))).toBe(false); // hard wall stops the walk
    expect(danger.has(cellKey(3, 4))).toBe(true);
    expect(danger.has(cellKey(3, 5))).toBe(true); // soft block IS in danger
    expect(danger.has(cellKey(3, 6))).toBe(false); // soft block absorbs further fan-out
  });

  it("adds live BlastTile cells to the danger set", () => {
    const world = new World();
    world.addEntity("blast.1");
    world.setComponent("blast.1", "GridPosition", { gx: 7, gz: 2 });
    world.setComponent("blast.1", "BlastTile", {});
    const occ = makeOcc({});
    const danger = buildBotDangerMap(world, {
      occupancy: occ,
      bombs: { run: () => [] },
      blastTiles: { run: () => ["blast.1"] }
    });
    expect(danger.has(cellKey(7, 2))).toBe(true);
  });
});

describe("botPassableNeighbours", () => {
  it("returns all four cardinals when the cell sits in open space", () => {
    const result = botPassableNeighbours({ gx: 5, gz: 5 }, makeOcc({}));
    expect(result).toHaveLength(4);
  });

  it("skips hard-walled cardinals", () => {
    const occ = makeOcc({ hard: [[6, 5]] });
    const result = botPassableNeighbours({ gx: 5, gz: 5 }, occ);
    expect(result.find((n) => n.dx === 1 && n.dz === 0)).toBeUndefined();
    expect(result).toHaveLength(3);
  });
});

describe("nearestBotPickup", () => {
  it("returns the closest non-danger pickup within radius", () => {
    const world = new World();
    world.addEntity("pickup.far");
    world.setComponent("pickup.far", "GridPosition", { gx: 10, gz: 10 });
    world.setComponent("pickup.far", "Pickup", {});
    world.addEntity("pickup.near");
    world.setComponent("pickup.near", "GridPosition", { gx: 5, gz: 4 });
    world.setComponent("pickup.near", "Pickup", {});
    const result = nearestBotPickup(
      world,
      { gx: 4, gz: 4 },
      new Set(),
      { run: () => ["pickup.far", "pickup.near"] },
      5
    );
    expect(result).toEqual({ gx: 5, gz: 4 });
  });

  it("ignores pickups in the danger set", () => {
    const world = new World();
    world.addEntity("p");
    world.setComponent("p", "GridPosition", { gx: 5, gz: 5 });
    world.setComponent("p", "Pickup", {});
    const result = nearestBotPickup(
      world,
      { gx: 4, gz: 5 },
      new Set([cellKey(5, 5)]),
      { run: () => ["p"] },
      5
    );
    expect(result).toBeUndefined();
  });

  it("ignores pickups beyond the max distance", () => {
    const world = new World();
    world.addEntity("p");
    world.setComponent("p", "GridPosition", { gx: 20, gz: 20 });
    world.setComponent("p", "Pickup", {});
    const result = nearestBotPickup(
      world,
      { gx: 4, gz: 5 },
      new Set(),
      { run: () => ["p"] },
      5
    );
    expect(result).toBeUndefined();
  });
});

describe("nearestBotOtherBomber", () => {
  it("returns the closest alive non-self bomber", () => {
    const world = new World();
    world.addEntity("self");
    world.setComponent("self", "BomberStats", { alive: true });
    world.setComponent("self", "GridPosition", { gx: 5, gz: 5 });
    world.addEntity("bot.dead");
    world.setComponent("bot.dead", "BomberStats", { alive: false });
    world.setComponent("bot.dead", "GridPosition", { gx: 6, gz: 5 });
    world.addEntity("bot.alive");
    world.setComponent("bot.alive", "BomberStats", { alive: true });
    world.setComponent("bot.alive", "GridPosition", { gx: 8, gz: 5 });
    const result = nearestBotOtherBomber(world, "self", { gx: 5, gz: 5 });
    expect(result).toEqual({ gx: 8, gz: 5 });
  });
});

describe("nearestBotSoftBlock + nearestBotPlayer", () => {
  it("nearestBotSoftBlock skips hard walls and pickups", () => {
    const world = new World();
    world.addEntity("hard");
    world.setComponent("hard", "GridPosition", { gx: 5, gz: 5 });
    world.setComponent("hard", "GridOccupant", { blocksMovement: true, blocksBlast: true });
    world.addEntity("soft");
    world.setComponent("soft", "GridPosition", { gx: 6, gz: 5 });
    world.setComponent("soft", "GridOccupant", { blocksMovement: true, blocksBlast: false });
    const r = nearestBotSoftBlock(world, { gx: 4, gz: 5 }, new Set(), 5);
    expect(r).toEqual({ gx: 6, gz: 5 });
  });

  it("nearestBotPlayer respects the max-distance cap", () => {
    const world = new World();
    world.addEntity("player.1");
    world.setComponent("player.1", "PlayerControlled", {});
    world.setComponent("player.1", "GridPosition", { gx: 20, gz: 20 });
    const r = nearestBotPlayer(world, { gx: 4, gz: 4 }, 5);
    expect(r).toBeUndefined();
  });
});

describe("findBotKickOpportunity", () => {
  it("returns the kick direction when own bomb sits between bot and enemy in line", () => {
    const world = new World();
    world.addEntity("bomb.own");
    world.setComponent("bomb.own", "Bomb", { ownerId: "bot.1" });
    world.setComponent("bomb.own", "GridPosition", { gx: 5, gz: 5 });
    world.addEntity("enemy");
    world.setComponent("enemy", "BomberStats", { alive: true });
    world.setComponent("enemy", "GridPosition", { gx: 7, gz: 5 });
    const occ = makeOcc({ bombs: [{ gx: 5, gz: 5, id: "bomb.own" }] });
    const dir = findBotKickOpportunity(world, "bot.1", { gx: 4, gz: 5 }, true, occ);
    expect(dir).toEqual({ dx: 1, dz: 0 });
  });

  it("returns undefined when canKick is false", () => {
    const world = new World();
    const occ = makeOcc({});
    expect(findBotKickOpportunity(world, "bot.1", { gx: 4, gz: 5 }, false, occ)).toBeUndefined();
  });
});

describe("decideBotShouldDropBomb", () => {
  it("returns false when standing in own danger map (fleeing)", () => {
    const world = new World();
    world.addEntity("bot.1");
    world.setComponent("bot.1", "BomberStats", { alive: true, activeBombs: 0, maxBombs: 1, range: 2 });
    const danger = new Set([cellKey(5, 5)]);
    const result = decideBotShouldDropBomb(
      world,
      "bot.1",
      { gx: 5, gz: 5 },
      { aggression: 1 },
      danger,
      0,
      { occupancy: makeOcc({}), rng: makeRng([0]) }
    );
    expect(result).toBe(false);
  });

  it("REMOTE branch commits when enemy is in blast", () => {
    const world = new World();
    world.addEntity("bot.1");
    world.setComponent("bot.1", "BomberStats", {
      alive: true,
      activeBombs: 0,
      maxBombs: 1,
      range: 2,
      remoteDetonateCharges: 1
    });
    world.addEntity("enemy");
    world.setComponent("enemy", "BomberStats", { alive: true });
    world.setComponent("enemy", "GridPosition", { gx: 6, gz: 5 });
    const result = decideBotShouldDropBomb(
      world,
      "bot.1",
      { gx: 5, gz: 5 },
      { aggression: 0 }, // aggression 0 — branch must override
      new Set(),
      0,
      { occupancy: makeOcc({}), rng: makeRng([0.99]) }
    );
    expect(result).toBe(true);
  });

  it("ADJACENT-SOFT branch rolls against aggression × personality", () => {
    const world = new World();
    world.addEntity("bot.1");
    world.setComponent("bot.1", "BomberStats", { alive: true, activeBombs: 0, maxBombs: 1, range: 2 });
    // Soft block to the east — movement-blocking + non-blast-blocking.
    const occ: BotOccupancyQuery = {
      blocked: (gx, gz, layer) =>
        gx === 6 && gz === 5 && layer === "movement",
      occupants: () => []
    };
    // aggression=1, hunter scale=1, boost=0 → effective 1.0; rng=0.5 fires.
    const result = decideBotShouldDropBomb(
      world,
      "bot.1",
      { gx: 5, gz: 5 },
      { aggression: 1, personality: "hunter" },
      new Set(),
      0,
      { occupancy: occ, rng: makeRng([0.5]) }
    );
    expect(result).toBe(true);
  });

  it("returns false at maxBombs cap", () => {
    const world = new World();
    world.addEntity("bot.1");
    world.setComponent("bot.1", "BomberStats", { alive: true, activeBombs: 2, maxBombs: 2, range: 2 });
    const result = decideBotShouldDropBomb(
      world,
      "bot.1",
      { gx: 5, gz: 5 },
      { aggression: 1 },
      new Set(),
      0,
      { occupancy: makeOcc({}), rng: makeRng([0]) }
    );
    expect(result).toBe(false);
  });
});

describe("pickBotDirection", () => {
  it("flees uniform-random over the safe pool when in danger", () => {
    const safe = [{ dx: 1, dz: 0, gx: 6, gz: 5 }];
    const result = pickBotDirection(
      { gx: 5, gz: 5 },
      { lastDecisionDx: 0, lastDecisionDz: -1 },
      new Set([cellKey(5, 5), cellKey(5, 4)]),
      undefined,
      { passableNeighbours: () => [...safe, { dx: 0, dz: -1, gx: 5, gz: 4 }], rng: makeRng([0]) }
    );
    // rng=0 picks index 0; safe pool = [+x]; lastDecision bias is OFF in flee path.
    expect(result).toEqual({ dx: 1, dz: 0 });
  });

  it("biases toward last heading when wandering", () => {
    const result = pickBotDirection(
      { gx: 5, gz: 5 },
      { lastDecisionDx: 1, lastDecisionDz: 0 },
      new Set(),
      undefined,
      {
        passableNeighbours: () => [
          { dx: 1, dz: 0, gx: 6, gz: 5 },
          { dx: 0, dz: 1, gx: 5, gz: 6 }
        ],
        rng: makeRng([0.5]) // < 0.6 → bias fires
      }
    );
    expect(result).toEqual({ dx: 1, dz: 0 });
  });

  it("returns {0,0} when boxed in", () => {
    const result = pickBotDirection(
      { gx: 5, gz: 5 },
      {},
      new Set(),
      undefined,
      { passableNeighbours: () => [], rng: makeRng([0]) }
    );
    expect(result).toEqual({ dx: 0, dz: 0 });
  });
});

describe("selectBotPersonalityGoal", () => {
  it("coward returns undefined", () => {
    const r = selectBotPersonalityGoal(new World(), { gx: 5, gz: 5 }, "coward", new Set(), {
      nearestPickup: () => ({ gx: 6, gz: 5 }),
      nearestSoftBlock: () => ({ gx: 7, gz: 5 }),
      anticipatedPlayer: () => ({ gx: 8, gz: 5 })
    });
    expect(r).toBeUndefined();
  });

  it("miner picks the closer of pickup vs soft block", () => {
    const r = selectBotPersonalityGoal(new World(), { gx: 5, gz: 5 }, "miner", new Set(), {
      nearestPickup: () => ({ gx: 7, gz: 5 }),
      nearestSoftBlock: () => ({ gx: 6, gz: 5 }),
      anticipatedPlayer: () => ({ gx: 100, gz: 100 })
    });
    expect(r).toEqual({ gx: 6, gz: 5 });
  });

  it("hunter falls through to pickup when no player anticipated", () => {
    const r = selectBotPersonalityGoal(new World(), { gx: 5, gz: 5 }, "hunter", new Set(), {
      nearestPickup: () => ({ gx: 7, gz: 5 }),
      nearestSoftBlock: () => undefined,
      anticipatedPlayer: () => undefined
    });
    expect(r).toEqual({ gx: 7, gz: 5 });
  });
});
