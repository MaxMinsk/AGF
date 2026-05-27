// S153 KABOOM-PLAYER-PROFILE (GDP-2026-05-27-009 v1) — pure localStorage
// player profile store. Holds a stable playerId + lifetime stats, no
// server sync, no IndexedDB. Privacy stance: per-origin per-browser
// only; nothing leaves the user's machine. The user can clear it via
// browser tools at will.
//
// Scope reductions vs the GDP §3:
//   - deathsByOwnBomb + chainReactionsTriggered + maxChainLength stat
//     keys are tracked in the schema but not yet wired (need deeper
//     blast / death hooks; deferred to a follow-up sprint).
//   - preferredRecipeSeed stored but not consumed yet (no recipe re-
//     application path wired in bootstrap).
//   - HUD lifetime indicator (`?showLifetime=true`) deferred — agent
//     probes (window.__agf.kaboom.getProfile) cover the inspection
//     surface for v1.

const PROFILE_STORAGE_KEY = "kaboom.player.profile.v1";
const PROFILE_FORMAT_VERSION = 1 as const;
// Write debounce — batches rapid stat bumps so a chain detonation
// doesn't hammer localStorage. flushProfile() forces a write on demand
// (tests + clean shutdown).
const PROFILE_WRITE_DEBOUNCE_MS = 2000;

export type PickupCounters = Record<string, number>;

export type LifetimeStats = {
  matchesPlayed: number;
  matchesWon: number;
  roundsPlayed: number;
  roundsWon: number;
  roundsLost: number;
  roundsDraw: number;
  deathsByOwnBomb: number;
  chainReactionsTriggered: number;
  maxChainLength: number;
  pickupsCollected: PickupCounters;
};

export type PlayerProfile = {
  agfFormatVersion: typeof PROFILE_FORMAT_VERSION;
  playerId: string;
  createdAt: number;
  lastSeenAt: number;
  preferredRecipeSeed?: number;
  lifetimeStats: LifetimeStats;
};

function defaultLifetimeStats(): LifetimeStats {
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
    pickupsCollected: {}
  };
}

function defaultProfile(now: number, genId: () => string): PlayerProfile {
  return {
    agfFormatVersion: PROFILE_FORMAT_VERSION,
    playerId: genId(),
    createdAt: now,
    lastSeenAt: now,
    lifetimeStats: defaultLifetimeStats()
  };
}

export type ProfileStoreDeps = {
  storage?: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
  now?: () => number;
  genId?: () => string;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
};

export type ProfileStore = {
  /** Returns the current profile (loaded once, mutated in place by store calls). */
  get(): PlayerProfile;
  /** Reads from storage; creates a default if missing OR if the stored format version is unknown. */
  load(): PlayerProfile;
  /** Forces an immediate write to storage (bypasses debounce). */
  flush(): void;
  /**
   * Mutates a single lifetime stat. `by` defaults to 1.
   * Pickup counters use a path like 'pickupsCollected.bomb-up'.
   * Schedules a debounced write; call flush() to write immediately.
   */
  incrementStat(key: string, by?: number): void;
  /** Atomically replaces stat values (for testing + agent overrides). */
  setStats(partial: Partial<LifetimeStats>): void;
  /** Records a round outcome — bumps roundsPlayed + the matching W/L/D counter. */
  recordRoundOutcome(outcome: "won" | "lost" | "draw"): void;
  /** Records a match outcome — bumps matchesPlayed + matchesWon (when 'won'). */
  recordMatchOutcome(outcome: "won" | "lost" | "draw"): void;
  /** Records a pickup-collect — bumps pickupsCollected[kind]. */
  recordPickup(kind: string): void;
  /** Records a chain reaction — bumps chainReactionsTriggered + tracks max. */
  recordChain(length: number): void;
  /** Records a self-blast death — bumps deathsByOwnBomb. */
  recordSelfDeath(): void;
  /** Clears the profile from storage AND resets the in-memory state. */
  reset(): void;
};

export function createProfileStore(deps: ProfileStoreDeps = {}): ProfileStore {
  const storage = deps.storage;
  const now = deps.now ?? (() => Date.now());
  // crypto.randomUUID may not exist in older test envs; cheap fallback
  // mixes Math.random + a counter so the test-harness path is stable.
  let idCounter = 0;
  const fallbackGenId = (): string => {
    idCounter += 1;
    const rand = Math.random().toString(36).slice(2, 10);
    return `kaboom-${rand}-${idCounter}`;
  };
  const genId = deps.genId ?? (() => {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    return c?.randomUUID?.() ?? fallbackGenId();
  });
  const setTimeoutFn = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn = deps.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let cached: PlayerProfile | undefined;
  let pendingTimer: unknown;

  function readFromStorage(): PlayerProfile | undefined {
    if (storage === undefined) return undefined;
    try {
      const raw = storage.getItem(PROFILE_STORAGE_KEY);
      if (raw === null) return undefined;
      const parsed = JSON.parse(raw) as PlayerProfile;
      if (parsed.agfFormatVersion !== PROFILE_FORMAT_VERSION) {
        // Schema mismatch → fall back to defaults. The legacy entry
        // stays in storage; a future migration story can rescue it.
        // Warn at most once per load.
        console.warn(`[kaboom.profile] Stored profile has unknown format version ${String(parsed.agfFormatVersion)}; using defaults.`);
        return undefined;
      }
      // Defensive — re-hydrate pickupsCollected if it's somehow missing.
      if (parsed.lifetimeStats === undefined) {
        parsed.lifetimeStats = defaultLifetimeStats();
      } else if (parsed.lifetimeStats.pickupsCollected === undefined) {
        parsed.lifetimeStats.pickupsCollected = {};
      }
      return parsed;
    } catch (err) {
      console.warn(`[kaboom.profile] Failed to parse stored profile: ${String(err)}`);
      return undefined;
    }
  }

  function writeNow(): void {
    if (storage === undefined || cached === undefined) return;
    try {
      storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(cached));
    } catch (err) {
      // Quota / disabled storage — silent. Stats keep accumulating in
      // memory so the current session still benefits.
      console.warn(`[kaboom.profile] Failed to persist profile: ${String(err)}`);
    }
  }

  function schedule(): void {
    if (pendingTimer !== undefined) return;
    pendingTimer = setTimeoutFn(() => {
      pendingTimer = undefined;
      writeNow();
    }, PROFILE_WRITE_DEBOUNCE_MS);
  }

  function ensure(): PlayerProfile {
    if (cached !== undefined) return cached;
    const stored = readFromStorage();
    if (stored !== undefined) {
      stored.lastSeenAt = now();
      cached = stored;
      schedule();
      return cached;
    }
    cached = defaultProfile(now(), genId);
    writeNow();
    return cached;
  }

  return {
    get(): PlayerProfile {
      return ensure();
    },
    load(): PlayerProfile {
      cached = undefined;
      return ensure();
    },
    flush(): void {
      if (pendingTimer !== undefined) {
        clearTimeoutFn(pendingTimer);
        pendingTimer = undefined;
      }
      writeNow();
    },
    incrementStat(key: string, by: number = 1): void {
      const profile = ensure();
      const stats = profile.lifetimeStats as unknown as Record<string, unknown>;
      if (key.startsWith("pickupsCollected.")) {
        const sub = key.slice("pickupsCollected.".length);
        profile.lifetimeStats.pickupsCollected[sub] =
          (profile.lifetimeStats.pickupsCollected[sub] ?? 0) + by;
      } else if (typeof stats[key] === "number") {
        stats[key] = (stats[key] as number) + by;
      } else {
        // Unknown key — accept silently; future schema migrations may
        // add new counters and we don't want to throw on partial data.
        stats[key] = by;
      }
      schedule();
    },
    setStats(partial: Partial<LifetimeStats>): void {
      const profile = ensure();
      profile.lifetimeStats = { ...profile.lifetimeStats, ...partial };
      schedule();
    },
    recordRoundOutcome(outcome): void {
      const profile = ensure();
      profile.lifetimeStats.roundsPlayed += 1;
      if (outcome === "won") profile.lifetimeStats.roundsWon += 1;
      else if (outcome === "lost") profile.lifetimeStats.roundsLost += 1;
      else profile.lifetimeStats.roundsDraw += 1;
      schedule();
    },
    recordMatchOutcome(outcome): void {
      const profile = ensure();
      profile.lifetimeStats.matchesPlayed += 1;
      if (outcome === "won") profile.lifetimeStats.matchesWon += 1;
      schedule();
    },
    recordPickup(kind): void {
      const profile = ensure();
      profile.lifetimeStats.pickupsCollected[kind] =
        (profile.lifetimeStats.pickupsCollected[kind] ?? 0) + 1;
      schedule();
    },
    recordChain(length): void {
      const profile = ensure();
      profile.lifetimeStats.chainReactionsTriggered += 1;
      if (length > profile.lifetimeStats.maxChainLength) {
        profile.lifetimeStats.maxChainLength = length;
      }
      schedule();
    },
    recordSelfDeath(): void {
      const profile = ensure();
      profile.lifetimeStats.deathsByOwnBomb += 1;
      schedule();
    },
    reset(): void {
      if (pendingTimer !== undefined) {
        clearTimeoutFn(pendingTimer);
        pendingTimer = undefined;
      }
      cached = undefined;
      if (storage !== undefined) {
        try {
          storage.removeItem(PROFILE_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    }
  };
}

export const __PROFILE_STORAGE_KEY = PROFILE_STORAGE_KEY;
