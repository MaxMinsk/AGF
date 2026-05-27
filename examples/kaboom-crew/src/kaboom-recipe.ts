// S104 + S139 — pure recipe-derivation rules for Kaboom Crew bombers.
//
// Pulled out of bootstrap.ts so the personality variants are testable
// in isolation. player.1 keeps the historical sky-blue palette;
// bot.1 defaults to rose unless a personality is supplied, in which
// case it gets the personality-specific palette + accessory marker.

import type {
  BomberAccessory,
  ResolvedCharacterRecipe
} from "../../procbomber-bench/src/character-recipe";
import { recipeForOwner } from "./procbomber-integration";
import type { BomberPaletteName } from "../../procbomber-bench/src/generators/bomber-palette";
import type { AccessoryKind } from "../../procbomber-bench/src/accessories/catalog";
import type { BotPersonality } from "./difficulty";

/** S139 — palette assigned to each personality. */
export const PERSONALITY_PALETTE: Record<BotPersonality, BomberPaletteName> = {
  hunter: "ember",
  coward: "slate",
  miner: "sand"
};

/**
 * S139 — single distinctive accessory per personality so the player
 * can read which one they're facing at a glance. Each accessory
 * already has a default mount socket via ACCESSORY_DEFAULT_SOCKET.
 */
export const PERSONALITY_ACCESSORY: Record<BotPersonality, AccessoryKind> = {
  hunter: "antennae",
  coward: "visor",
  miner: "cap"
};

/** S141 — match `bot.<digits>` ids so multi-bot solo lands on the same path as bot.1. */
const BOT_ID_RE = /^bot\.\d+$/;

/**
 * S141 — assignment of personalities to the three solo-mode bots.
 * Stable order: bot.1 hunter, bot.2 coward, bot.3 miner — so every
 * solo match shows all three variants. Order doubles as the
 * canonical solo bot list for the bootstrap loop.
 */
export const MULTI_BOT_ASSIGNMENT: ReadonlyArray<{ id: string; personality: BotPersonality }> = [
  { id: "bot.1", personality: "hunter" },
  { id: "bot.2", personality: "coward" },
  { id: "bot.3", personality: "miner" }
];

export const MULTI_BOT_IDS: ReadonlyArray<string> = MULTI_BOT_ASSIGNMENT.map((b) => b.id);

/**
 * Build the recipe for a kaboom-crew bomber.
 *   - player.1 → "sky" palette, seed-driven everything else.
 *   - bot.N (any digit suffix) + personality → personality palette + single accessory.
 *   - bot.N without personality (e.g. connected profile) → legacy "rose" for backward compat.
 *   - anything else → seed-driven recipe verbatim.
 */
export function makeKaboomRecipe(
  ownerId: string,
  personality?: BotPersonality,
  options?: { unlockedAccessoryKinds?: ReadonlyArray<string> }
): ResolvedCharacterRecipe {
  const base = recipeForOwner(ownerId);
  if (ownerId === "player.1") {
    // S156 KABOOM-COSMETIC-UNLOCKS — filter the random-default
    // accessories to the unlocked subset. When the caller doesn't
    // supply an unlocked list (legacy callers, tests), behaviour
    // matches the pre-S156 default (all 5 kinds available).
    const unlocked = options?.unlockedAccessoryKinds;
    if (unlocked !== undefined) {
      const allowed = new Set(unlocked);
      const filtered = (base.accessories ?? []).filter((a) => allowed.has(a.kind));
      return { ...base, paletteName: "sky", accessories: filtered };
    }
    return { ...base, paletteName: "sky" };
  }
  if (BOT_ID_RE.test(ownerId)) {
    if (personality === undefined) {
      return { ...base, paletteName: "rose" };
    }
    const accessory: BomberAccessory = { kind: PERSONALITY_ACCESSORY[personality] };
    return {
      ...base,
      paletteName: PERSONALITY_PALETTE[personality],
      accessories: [accessory]
    };
  }
  return base;
}
