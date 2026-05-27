// S153 KABOOM-PLAYER-PROFILE — unit tests for the localStorage-backed
// profile store. Covers default-on-empty, roundtrip persistence,
// schema version mismatch fallback, atomic increments, debounced
// writes, and the event-driven counters (round / match / pickup /
// chain / self-death).

import { describe, expect, it, vi } from "vitest";

import {
  __PROFILE_STORAGE_KEY,
  createProfileStore,
  type PlayerProfile
} from "../../src/profile/profile-store";

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    raw: store,
    api: {
      getItem(k: string): string | null { return store.get(k) ?? null; },
      setItem(k: string, v: string): void { store.set(k, v); },
      removeItem(k: string): void { store.delete(k); }
    }
  };
}

function fakeTimers() {
  // Capture deferred work without actually running through the real
  // event loop. flush() simulates the debounce timer elapsing.
  let pending: { fn: () => void; id: number } | undefined;
  let nextId = 0;
  return {
    pending: () => pending,
    setTimeoutFn: ((fn: () => void): unknown => {
      nextId += 1;
      pending = { fn, id: nextId };
      return nextId;
    }) as (fn: () => void, ms: number) => unknown,
    clearTimeoutFn: ((h: unknown): void => {
      if (pending?.id === h) pending = undefined;
    }) as (h: unknown) => void,
    fire(): void {
      if (pending !== undefined) {
        const fn = pending.fn;
        pending = undefined;
        fn();
      }
    }
  };
}

const FIXED_NOW = 1700000000000;
const FIXED_ID = "test-player-id";

describe("createProfileStore (S153)", () => {
  it("get() creates a default profile when storage is empty + persists immediately", () => {
    const s = fakeStorage();
    const store = createProfileStore({
      storage: s.api,
      now: () => FIXED_NOW,
      genId: () => FIXED_ID
    });
    const p = store.get();
    expect(p.playerId).toBe(FIXED_ID);
    expect(p.createdAt).toBe(FIXED_NOW);
    expect(p.lastSeenAt).toBe(FIXED_NOW);
    expect(p.lifetimeStats.matchesPlayed).toBe(0);
    expect(p.lifetimeStats.pickupsCollected).toEqual({});
    // Default profile gets written immediately (not debounced).
    expect(s.raw.has(__PROFILE_STORAGE_KEY)).toBe(true);
  });

  it("subsequent get() calls return the same playerId (memoised + persisted)", () => {
    const s = fakeStorage();
    let calls = 0;
    const store = createProfileStore({
      storage: s.api,
      now: () => FIXED_NOW,
      genId: () => `id-${++calls}`
    });
    const a = store.get();
    const b = store.get();
    expect(a.playerId).toBe("id-1");
    expect(b.playerId).toBe("id-1"); // not regenerated
  });

  it("load() reads existing profile from storage on the SAME store instance", () => {
    const s = fakeStorage({
      [__PROFILE_STORAGE_KEY]: JSON.stringify({
        agfFormatVersion: 1,
        playerId: "preexisting-id",
        createdAt: 100,
        lastSeenAt: 200,
        lifetimeStats: {
          matchesPlayed: 7,
          matchesWon: 3,
          roundsPlayed: 30,
          roundsWon: 14,
          roundsLost: 11,
          roundsDraw: 5,
          deathsByOwnBomb: 2,
          chainReactionsTriggered: 1,
          maxChainLength: 3,
          pickupsCollected: { "bomb-up": 5, "fire-up": 4 }
        }
      })
    });
    const store = createProfileStore({ storage: s.api, now: () => FIXED_NOW });
    const p = store.load();
    expect(p.playerId).toBe("preexisting-id");
    expect(p.createdAt).toBe(100);
    expect(p.lastSeenAt).toBe(FIXED_NOW); // freshly stamped
    expect(p.lifetimeStats.matchesPlayed).toBe(7);
    expect(p.lifetimeStats.pickupsCollected["bomb-up"]).toBe(5);
  });

  it("schema version mismatch on load → falls back to defaults + logs warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = fakeStorage({
      [__PROFILE_STORAGE_KEY]: JSON.stringify({
        agfFormatVersion: 99,
        playerId: "should-be-ignored",
        lifetimeStats: { matchesPlayed: 999 }
      })
    });
    const store = createProfileStore({ storage: s.api, now: () => FIXED_NOW, genId: () => "fresh" });
    const p = store.get();
    expect(p.playerId).toBe("fresh");
    expect(p.lifetimeStats.matchesPlayed).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("corrupt JSON in storage → falls back to defaults + logs warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = fakeStorage({ [__PROFILE_STORAGE_KEY]: "not valid json" });
    const store = createProfileStore({ storage: s.api, now: () => FIXED_NOW, genId: () => "fresh" });
    const p = store.get();
    expect(p.playerId).toBe("fresh");
    warn.mockRestore();
  });

  it("incrementStat batches via debounce; flush() forces the write", () => {
    const s = fakeStorage();
    const t = fakeTimers();
    const store = createProfileStore({
      storage: s.api,
      now: () => FIXED_NOW,
      genId: () => FIXED_ID,
      setTimeoutFn: t.setTimeoutFn,
      clearTimeoutFn: t.clearTimeoutFn
    });
    store.get(); // default write
    s.raw.delete(__PROFILE_STORAGE_KEY); // reset to observe next write
    store.incrementStat("roundsPlayed", 3);
    store.incrementStat("roundsWon", 1);
    expect(s.raw.has(__PROFILE_STORAGE_KEY)).toBe(false); // debounced
    store.flush();
    expect(s.raw.has(__PROFILE_STORAGE_KEY)).toBe(true);
    const stored = JSON.parse(s.raw.get(__PROFILE_STORAGE_KEY)!) as PlayerProfile;
    expect(stored.lifetimeStats.roundsPlayed).toBe(3);
    expect(stored.lifetimeStats.roundsWon).toBe(1);
  });

  it("recordRoundOutcome bumps roundsPlayed + the matching counter", () => {
    const s = fakeStorage();
    const store = createProfileStore({ storage: s.api, now: () => FIXED_NOW, genId: () => FIXED_ID });
    store.recordRoundOutcome("won");
    store.recordRoundOutcome("lost");
    store.recordRoundOutcome("draw");
    store.recordRoundOutcome("won");
    store.flush();
    const p = store.get();
    expect(p.lifetimeStats.roundsPlayed).toBe(4);
    expect(p.lifetimeStats.roundsWon).toBe(2);
    expect(p.lifetimeStats.roundsLost).toBe(1);
    expect(p.lifetimeStats.roundsDraw).toBe(1);
  });

  it("recordMatchOutcome bumps matchesPlayed; matchesWon only when 'won'", () => {
    const s = fakeStorage();
    const store = createProfileStore({ storage: s.api, now: () => FIXED_NOW, genId: () => FIXED_ID });
    store.recordMatchOutcome("won");
    store.recordMatchOutcome("lost");
    store.recordMatchOutcome("draw");
    store.flush();
    const p = store.get();
    expect(p.lifetimeStats.matchesPlayed).toBe(3);
    expect(p.lifetimeStats.matchesWon).toBe(1);
  });

  it("recordPickup per-kind counter", () => {
    const s = fakeStorage();
    const store = createProfileStore({ storage: s.api, now: () => FIXED_NOW, genId: () => FIXED_ID });
    store.recordPickup("bomb-up");
    store.recordPickup("bomb-up");
    store.recordPickup("pierce");
    store.flush();
    const p = store.get();
    expect(p.lifetimeStats.pickupsCollected["bomb-up"]).toBe(2);
    expect(p.lifetimeStats.pickupsCollected["pierce"]).toBe(1);
    expect(p.lifetimeStats.pickupsCollected["kick"]).toBeUndefined();
  });

  it("recordChain bumps counter + tracks maxChainLength", () => {
    const s = fakeStorage();
    const store = createProfileStore({ storage: s.api, now: () => FIXED_NOW, genId: () => FIXED_ID });
    store.recordChain(3);
    store.recordChain(2);
    store.recordChain(5);
    store.recordChain(4);
    store.flush();
    const p = store.get();
    expect(p.lifetimeStats.chainReactionsTriggered).toBe(4);
    expect(p.lifetimeStats.maxChainLength).toBe(5);
  });

  it("recordSelfDeath bumps deathsByOwnBomb", () => {
    const s = fakeStorage();
    const store = createProfileStore({ storage: s.api, now: () => FIXED_NOW, genId: () => FIXED_ID });
    store.recordSelfDeath();
    store.recordSelfDeath();
    store.flush();
    expect(store.get().lifetimeStats.deathsByOwnBomb).toBe(2);
  });

  it("setStats replaces partial values + persists on flush", () => {
    const s = fakeStorage();
    const store = createProfileStore({ storage: s.api, now: () => FIXED_NOW, genId: () => FIXED_ID });
    store.setStats({ roundsWon: 10, matchesPlayed: 4 });
    store.flush();
    const p = store.get();
    expect(p.lifetimeStats.roundsWon).toBe(10);
    expect(p.lifetimeStats.matchesPlayed).toBe(4);
    expect(p.lifetimeStats.roundsPlayed).toBe(0); // untouched
  });

  it("reset() wipes storage + drops in-memory state", () => {
    const s = fakeStorage();
    let calls = 0;
    const store = createProfileStore({
      storage: s.api,
      now: () => FIXED_NOW,
      genId: () => `id-${++calls}`
    });
    const first = store.get();
    expect(first.playerId).toBe("id-1");
    store.reset();
    expect(s.raw.has(__PROFILE_STORAGE_KEY)).toBe(false);
    const second = store.get();
    expect(second.playerId).toBe("id-2"); // brand new id
  });

  it("incrementStat with unknown key — silent + saved (forward-compat)", () => {
    const s = fakeStorage();
    const store = createProfileStore({ storage: s.api, now: () => FIXED_NOW, genId: () => FIXED_ID });
    store.incrementStat("achievementsUnlocked", 2);
    store.flush();
    const stored = JSON.parse(s.raw.get(__PROFILE_STORAGE_KEY)!) as { lifetimeStats: Record<string, unknown> };
    expect(stored.lifetimeStats["achievementsUnlocked"]).toBe(2);
  });

  it("incrementStat with 'pickupsCollected.X' key uses the sub-map", () => {
    const s = fakeStorage();
    const store = createProfileStore({ storage: s.api, now: () => FIXED_NOW, genId: () => FIXED_ID });
    store.incrementStat("pickupsCollected.shield", 3);
    store.incrementStat("pickupsCollected.shield", 1);
    store.flush();
    expect(store.get().lifetimeStats.pickupsCollected["shield"]).toBe(4);
  });

  it("undefined storage — store still functions in-memory", () => {
    const store = createProfileStore({ now: () => FIXED_NOW, genId: () => FIXED_ID });
    store.recordRoundOutcome("won");
    store.flush();
    expect(store.get().lifetimeStats.roundsWon).toBe(1);
  });
});
