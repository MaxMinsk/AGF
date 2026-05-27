// S156 KABOOM-COSMETIC-UNLOCKS — pure-function tests for the unlock
// checker + helpers. Covers each unlock def's threshold, newly-vs-
// already-unlocked semantics, edge cases (zero stats, all unlocked,
// stat rollback), and the accessory-kind lookup.

import { describe, expect, it } from "vitest";

import {
  checkUnlocks,
  findUnlock,
  unlockedAccessoryKinds,
  UNLOCK_DEFS,
  type UnlockId
} from "../../src/profile/unlock-checker";
import type { LifetimeStats } from "../../src/profile/profile-store";

function emptyStats(overrides: Partial<LifetimeStats> = {}): LifetimeStats {
  return {
    matchesPlayed: 0,
    matchesWon: 0,
    roundsPlayed: 0,
    roundsWon: 0,
    roundsLost: 0,
    roundsDraw: 0,
    deathsByOwnBomb: 0,
    chainReactionsTriggered: 0,
    maxChainLength: 0,
    pickupsCollected: {},
    ...overrides
  };
}

describe("UNLOCK_DEFS catalogue (S156)", () => {
  it("ships exactly 5 starter unlocks", () => {
    expect(UNLOCK_DEFS.length).toBe(5);
  });

  it("each unlock maps to a distinct accessory kind (1:1 with the 5-kind catalog)", () => {
    const seen = new Set<string>();
    for (const def of UNLOCK_DEFS) seen.add(def.accessory);
    expect(seen.size).toBe(5);
    expect(seen).toEqual(new Set(["cap", "fins", "antennae", "visor", "backpack"]));
  });

  it("ids are stable + unique", () => {
    const ids = UNLOCK_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["first-win", "survivalist", "chain-reactionist", "pyromaniac", "veteran"]);
  });
});

describe("checkUnlocks (S156)", () => {
  it("returns no unlocks for a fresh profile", () => {
    const r = checkUnlocks(emptyStats(), []);
    expect(r.allUnlocked).toEqual([]);
    expect(r.newlyUnlocked).toEqual([]);
  });

  it("first-win — fires once after first match win", () => {
    const r = checkUnlocks(emptyStats({ matchesWon: 1 }), []);
    expect(r.allUnlocked).toContain("first-win");
    expect(r.newlyUnlocked).toEqual(["first-win"]);
  });

  it("first-win — does NOT re-fire on subsequent wins", () => {
    const r = checkUnlocks(emptyStats({ matchesWon: 3 }), ["first-win"]);
    expect(r.allUnlocked).toContain("first-win");
    expect(r.newlyUnlocked).toEqual([]);
  });

  it("survivalist — threshold crossing at roundsWon=10 (9→10 fires, 10→11 doesn't)", () => {
    expect(checkUnlocks(emptyStats({ roundsWon: 9 }), []).newlyUnlocked).toEqual([]);
    expect(checkUnlocks(emptyStats({ roundsWon: 10 }), []).newlyUnlocked).toEqual(["survivalist"]);
    expect(checkUnlocks(emptyStats({ roundsWon: 11 }), ["survivalist"]).newlyUnlocked).toEqual([]);
  });

  it("chain-reactionist — maxChainLength ≥ 5", () => {
    expect(checkUnlocks(emptyStats({ maxChainLength: 4 }), []).newlyUnlocked).toEqual([]);
    expect(checkUnlocks(emptyStats({ maxChainLength: 5 }), []).newlyUnlocked).toEqual(["chain-reactionist"]);
  });

  it("pyromaniac — deathsByOwnBomb ≥ 5", () => {
    expect(checkUnlocks(emptyStats({ deathsByOwnBomb: 4 }), []).newlyUnlocked).toEqual([]);
    expect(checkUnlocks(emptyStats({ deathsByOwnBomb: 5 }), []).newlyUnlocked).toEqual(["pyromaniac"]);
  });

  it("veteran — roundsPlayed ≥ 50", () => {
    expect(checkUnlocks(emptyStats({ roundsPlayed: 49 }), []).newlyUnlocked).toEqual([]);
    expect(checkUnlocks(emptyStats({ roundsPlayed: 50 }), []).newlyUnlocked).toEqual(["veteran"]);
  });

  it("multiple unlocks crossing in one check are all returned newly-unlocked", () => {
    const r = checkUnlocks(emptyStats({
      matchesWon: 1,
      maxChainLength: 5,
      deathsByOwnBomb: 5
    }), []);
    expect(r.newlyUnlocked.sort()).toEqual(["chain-reactionist", "first-win", "pyromaniac"]);
    expect(r.allUnlocked.length).toBe(3);
  });

  it("all 5 unlocked → newlyUnlocked is empty + allUnlocked has 5", () => {
    const stats = emptyStats({
      matchesWon: 1,
      roundsWon: 10,
      maxChainLength: 5,
      deathsByOwnBomb: 5,
      roundsPlayed: 50
    });
    const r = checkUnlocks(stats, ["first-win", "survivalist", "chain-reactionist", "pyromaniac", "veteran"]);
    expect(r.allUnlocked.length).toBe(5);
    expect(r.newlyUnlocked).toEqual([]);
  });

  it("stat rollback (lower threshold than recorded unlock) — keeps the unlock", () => {
    // Defensive — players don't lose progression once earned.
    const r = checkUnlocks(emptyStats({ roundsWon: 2 }), ["survivalist"]);
    expect(r.allUnlocked).toContain("survivalist");
    expect(r.newlyUnlocked).toEqual([]);
  });

  it("unknown unlock id in currentUnlocks — silently dropped (forward-compat)", () => {
    const r = checkUnlocks(emptyStats(), ["unknown-future-unlock"]);
    expect(r.allUnlocked).toEqual([]);
  });
});

describe("unlockedAccessoryKinds (S156)", () => {
  it("empty unlocks → empty pool", () => {
    expect(unlockedAccessoryKinds([])).toEqual([]);
  });

  it("first-win → ['cap']", () => {
    expect(unlockedAccessoryKinds(["first-win"])).toEqual(["cap"]);
  });

  it("dedupes when somehow the same kind appears twice via different unlock ids (forward-compat)", () => {
    expect(unlockedAccessoryKinds(["first-win", "first-win"])).toEqual(["cap"]);
  });

  it("unknown ids skipped silently (forward-compat)", () => {
    expect(unlockedAccessoryKinds(["first-win", "future-stuff"])).toEqual(["cap"]);
  });

  it("all 5 unlocks → all 5 accessory kinds", () => {
    const r = unlockedAccessoryKinds(["first-win", "survivalist", "chain-reactionist", "pyromaniac", "veteran"]);
    expect(r.sort()).toEqual(["antennae", "backpack", "cap", "fins", "visor"]);
  });
});

describe("findUnlock (S156)", () => {
  it("returns the def for a known id", () => {
    const d = findUnlock("first-win");
    expect(d).toBeDefined();
    expect(d?.accessory).toBe("cap");
  });

  it("returns undefined for an unknown id", () => {
    expect(findUnlock("not-a-real-id" as UnlockId)).toBeUndefined();
  });
});
