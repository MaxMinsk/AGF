// S150 KABOOM-OPPONENT-BADGES — Layer 3 of GDP-2026-05-27-005 (HUD
// approximation). Pure helpers that turn a non-self bomber's
// BomberStats into the ordered set of discrete-state icons to render
// in the new kaboom.opponent-badges HUD widget.
//
// Scope per the GDP: ONLY discrete active states (shield / pierce /
// remote-charges > 0 / throw-glove). NEVER numeric stats (bombs / fire
// / speed levels) — those stay hidden so the tactical guessing layer
// per gameplay-systems.md §14 stays intact. Kick (passive — no
// visible behaviour until used) is also intentionally excluded.
//
// Deviation from GDP: the canonical Layer 3 puts icons on world-space
// billboards above each bomber. The engine has no world-to-screen /
// billboard primitive yet, so this sprint ships a HUD-side
// approximation — small icon rows per non-self bomber in the bottom-
// left panel. The world-space variant is deferred to a follow-up.

import type { PowerupIconKind } from "./powerup-icons";

/** Stats subset the badges need. Mirrors the BootStrap snapshot shape. */
export type OpponentBomberStats = {
  alive?: boolean | undefined;
  shield?: boolean | undefined;
  pierce?: boolean | undefined;
  remoteDetonateCharges?: number | undefined;
  canThrow?: boolean | undefined;
};

/**
 * Build the icon list for a single opponent bomber. Order is fixed
 * across frames so badges don't shuffle when an icon flips on/off.
 * Returns an empty array when no discrete state is active (caller
 * should skip the row entirely per the GDP).
 */
export function badgesForOpponent(stats: OpponentBomberStats): ReadonlyArray<PowerupIconKind> {
  if (stats.alive === false) return [];
  const out: PowerupIconKind[] = [];
  if (stats.shield === true) out.push("shield");
  if (stats.pierce === true) out.push("pierce");
  if ((stats.remoteDetonateCharges ?? 0) > 0) out.push("remote");
  if (stats.canThrow === true) out.push("throw-glove");
  return out;
}

/**
 * Local bomber-id heuristic: solo + connected both use 'player.1'
 * for the local human player. Multi-tab connected mode would need a
 * per-tab identity (out of scope here — this is a solo + 1-tab HUD).
 */
export const LOCAL_BOMBER_ID = "player.1";

export function isOpponent(id: string): boolean {
  return id !== LOCAL_BOMBER_ID;
}

/**
 * Personality → head-palette hex map. Mirrors the procbomber-bench
 * PALETTES table (the source of truth) but copy-pasted here so this
 * module stays free of the procbomber-bench dependency (it's a pure
 * UI helper). Kept narrow to the 3 personalities the multi-bot solo
 * spawn uses (S141 + S139); the fallback below handles unknown bots.
 */
const PERSONALITY_HEAD_HEX: Record<string, string> = {
  hunter: "#ff9874", // ember
  coward: "#c2cad6", // slate
  miner: "#f0d59a"   // sand
};
const ROSE_HEAD_HEX = "#ffb7c5";

/**
 * Return the accent colour for an opponent's badge row. Uses the
 * bomber's personality palette head colour when known; falls back to
 * the connected-mode "rose" head colour for server-owned bots that
 * arrive without a personality tag.
 */
export function opponentAccentColor(personality: string | undefined): string {
  if (personality !== undefined && personality in PERSONALITY_HEAD_HEX) {
    return PERSONALITY_HEAD_HEX[personality]!;
  }
  return ROSE_HEAD_HEX;
}
