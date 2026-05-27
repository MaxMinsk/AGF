// S156 KABOOM-COSMETIC-UNLOCKS — pure helpers for the 5 starter
// cosmetic unlocks from GDP-2026-05-27-011. The checker takes a
// LifetimeStats snapshot + the player's current unlock list and
// returns (allUnlocked, newlyUnlocked). Banner UI fires on each
// newlyUnlocked entry.
//
// Unlock IDs are STABLE string keys (not numeric indices) so adding
// future unlocks won't shift indices.
//
// Each starter unlock maps to ONE accessory kind from the existing
// 5-kind catalog (procbomber-bench/src/accessories/catalog.ts). The
// 1:1 mapping means there's no double-unlocking + no leftover kinds.

import type { LifetimeStats } from "./profile-store";

export type UnlockId =
  | "first-win"
  | "survivalist"
  | "chain-reactionist"
  | "pyromaniac"
  | "veteran";

export type UnlockAccessoryKind = "antennae" | "visor" | "backpack" | "cap" | "fins";

export type UnlockDef = {
  id: UnlockId;
  accessory: UnlockAccessoryKind;
  label: string;
  description: string;
  /** Returns the (current, target) progress pair for the locked-state UI. */
  progress: (stats: LifetimeStats) => { current: number; target: number };
  /** True when the lifetime stats meet the threshold. */
  isMet: (stats: LifetimeStats) => boolean;
};

export const UNLOCK_DEFS: ReadonlyArray<UnlockDef> = [
  {
    id: "first-win",
    accessory: "cap",
    label: "First Win",
    description: "Win your first match.",
    progress: (s) => ({ current: s.matchesWon, target: 1 }),
    isMet: (s) => s.matchesWon >= 1
  },
  {
    id: "survivalist",
    accessory: "fins",
    label: "Survivalist",
    description: "Win 10 rounds.",
    progress: (s) => ({ current: s.roundsWon, target: 10 }),
    isMet: (s) => s.roundsWon >= 10
  },
  {
    id: "chain-reactionist",
    accessory: "antennae",
    label: "Chain Reactionist",
    description: "Trigger a 5-bomb chain reaction.",
    progress: (s) => ({ current: s.maxChainLength, target: 5 }),
    isMet: (s) => s.maxChainLength >= 5
  },
  {
    id: "pyromaniac",
    accessory: "visor",
    label: "Pyromaniac",
    description: "Kill yourself with your own bomb 5 times.",
    progress: (s) => ({ current: s.deathsByOwnBomb, target: 5 }),
    isMet: (s) => s.deathsByOwnBomb >= 5
  },
  {
    id: "veteran",
    accessory: "backpack",
    label: "Veteran",
    description: "Play 50 rounds.",
    progress: (s) => ({ current: s.roundsPlayed, target: 50 }),
    isMet: (s) => s.roundsPlayed >= 50
  }
];

export type UnlockCheckResult = {
  allUnlocked: ReadonlyArray<UnlockId>;
  newlyUnlocked: ReadonlyArray<UnlockId>;
};

/**
 * Evaluate every UNLOCK_DEF against the given lifetime stats. Returns
 * the full set of unlocks the player should have at this moment +
 * the subset that crossed the threshold since the previous list.
 *
 * Pure — caller persists allUnlocked into the profile.
 */
export function checkUnlocks(stats: LifetimeStats, currentUnlocks: ReadonlyArray<string>): UnlockCheckResult {
  const currentSet = new Set(currentUnlocks);
  const allUnlocked: UnlockId[] = [];
  const newlyUnlocked: UnlockId[] = [];
  for (const def of UNLOCK_DEFS) {
    if (def.isMet(stats)) {
      allUnlocked.push(def.id);
      if (!currentSet.has(def.id)) newlyUnlocked.push(def.id);
    } else if (currentSet.has(def.id)) {
      // Edge case: a stat was rolled back via setStats. Keep the
      // unlock — players don't lose progression once earned.
      allUnlocked.push(def.id);
    }
  }
  return { allUnlocked, newlyUnlocked };
}

/**
 * Resolve a list of unlock IDs to the corresponding accessory kinds.
 * Unknown ids are skipped (forward-compat — a future schema migration
 * might leave legacy ids in the profile).
 */
export function unlockedAccessoryKinds(unlockIds: ReadonlyArray<string>): ReadonlyArray<UnlockAccessoryKind> {
  const byId = new Map<string, UnlockAccessoryKind>();
  for (const def of UNLOCK_DEFS) byId.set(def.id, def.accessory);
  const out: UnlockAccessoryKind[] = [];
  for (const id of unlockIds) {
    const kind = byId.get(id);
    if (kind !== undefined && !out.includes(kind)) out.push(kind);
  }
  return out;
}

/** Look up a single UnlockDef by id. Returns undefined for unknown ids. */
export function findUnlock(id: string): UnlockDef | undefined {
  return UNLOCK_DEFS.find((d) => d.id === id);
}
