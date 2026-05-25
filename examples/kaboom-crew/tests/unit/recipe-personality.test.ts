// S139 — recipe personality override tests.
//
// makeKaboomRecipe drives the bot's visible look. Three personalities
// → three palettes + three accessory markers. Player.1 stays on 'sky'
// regardless of personality. Backward compat: bot.1 without a
// personality (e.g. connected profile where server owns bot.1) falls
// back to legacy 'rose' with no forced accessory.

import { describe, expect, it } from "vitest";

import { makeKaboomRecipe, PERSONALITY_PALETTE, PERSONALITY_ACCESSORY } from "../../src/kaboom-recipe";

describe("makeKaboomRecipe — personality variants (S139)", () => {
  it("PERSONALITY_PALETTE maps each personality to a distinct BomberPaletteName", () => {
    expect(PERSONALITY_PALETTE.hunter).toBe("ember");
    expect(PERSONALITY_PALETTE.coward).toBe("slate");
    expect(PERSONALITY_PALETTE.miner).toBe("sand");
    const names = Object.values(PERSONALITY_PALETTE);
    expect(new Set(names).size).toBe(names.length);
  });

  it("PERSONALITY_ACCESSORY maps each personality to a distinct AccessoryKind", () => {
    expect(PERSONALITY_ACCESSORY.hunter).toBe("antennae");
    expect(PERSONALITY_ACCESSORY.coward).toBe("visor");
    expect(PERSONALITY_ACCESSORY.miner).toBe("cap");
    const kinds = Object.values(PERSONALITY_ACCESSORY);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("bot.1 + hunter → ember palette + single antennae accessory", () => {
    const recipe = makeKaboomRecipe("bot.1", "hunter");
    expect(recipe.paletteName).toBe("ember");
    expect(recipe.accessories).toHaveLength(1);
    expect(recipe.accessories[0]!.kind).toBe("antennae");
  });

  it("bot.1 + coward → slate palette + single visor accessory", () => {
    const recipe = makeKaboomRecipe("bot.1", "coward");
    expect(recipe.paletteName).toBe("slate");
    expect(recipe.accessories).toHaveLength(1);
    expect(recipe.accessories[0]!.kind).toBe("visor");
  });

  it("bot.1 + miner → sand palette + single cap accessory", () => {
    const recipe = makeKaboomRecipe("bot.1", "miner");
    expect(recipe.paletteName).toBe("sand");
    expect(recipe.accessories).toHaveLength(1);
    expect(recipe.accessories[0]!.kind).toBe("cap");
  });

  it("bot.1 without personality falls back to legacy 'rose' (backward compat for connected profile)", () => {
    const recipe = makeKaboomRecipe("bot.1");
    expect(recipe.paletteName).toBe("rose");
  });

  it("player.1 stays on 'sky' regardless of personality argument", () => {
    expect(makeKaboomRecipe("player.1").paletteName).toBe("sky");
    expect(makeKaboomRecipe("player.1", "hunter").paletteName).toBe("sky");
    expect(makeKaboomRecipe("player.1", "coward").paletteName).toBe("sky");
    expect(makeKaboomRecipe("player.1", "miner").paletteName).toBe("sky");
  });

  it("other entity ids get the seed-driven recipe verbatim", () => {
    const a = makeKaboomRecipe("bot.42");
    expect(a.paletteName).not.toBe("sky");
    expect(a.paletteName).not.toBe("rose");
    // Seed-driven; just confirm a recipe was produced.
    expect(typeof a.seed).toBe("string");
  });
});
