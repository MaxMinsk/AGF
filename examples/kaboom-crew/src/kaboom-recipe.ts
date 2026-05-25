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

/**
 * Build the recipe for a kaboom-crew bomber.
 *   - player.1 → "sky" palette, seed-driven everything else.
 *   - bot.1 + personality → personality palette + single accessory.
 *   - bot.1 without personality (e.g. connected profile) → legacy "rose".
 *   - anything else → seed-driven recipe verbatim.
 */
export function makeKaboomRecipe(
  ownerId: string,
  personality?: BotPersonality
): ResolvedCharacterRecipe {
  const base = recipeForOwner(ownerId);
  if (ownerId === "player.1") return { ...base, paletteName: "sky" };
  if (ownerId === "bot.1") {
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
