// S167 KABOOM-RECIPE-VOICE — voiceParamsFromRecipe unit tests.

import { describe, expect, it } from "vitest";

import { voiceParamsFromRecipe, type VoiceRecipeInput } from "../../src/voice-synth";

function recipe(overrides: Partial<VoiceRecipeInput> = {}): VoiceRecipeInput {
  return {
    seed: "test-bomber",
    torsoHeight: 0.45,
    headSize: 0.35,
    paletteName: "sky",
    accessoryKinds: [],
    botPersonality: undefined,
    ...overrides
  };
}

describe("voiceParamsFromRecipe (S167)", () => {
  it("is deterministic — same recipe → same colour twice", () => {
    const a = voiceParamsFromRecipe(recipe());
    const b = voiceParamsFromRecipe(recipe());
    expect(a).toEqual(b);
  });

  it("large torso → lower basePitchHz than small torso", () => {
    const big = voiceParamsFromRecipe(recipe({ torsoHeight: 0.60 }));
    const small = voiceParamsFromRecipe(recipe({ torsoHeight: 0.35 }));
    expect(big.basePitchHz).toBeLessThan(small.basePitchHz);
  });

  it("backpack accessory lowers basePitchHz further (bassier)", () => {
    const baseline = voiceParamsFromRecipe(recipe({ torsoHeight: 0.45 }));
    const withBackpack = voiceParamsFromRecipe(recipe({ torsoHeight: 0.45, accessoryKinds: ["backpack"] }));
    expect(withBackpack.basePitchHz).toBeLessThan(baseline.basePitchHz);
  });

  it("large head → higher formantF1Hz than small head", () => {
    const big = voiceParamsFromRecipe(recipe({ headSize: 0.45 }));
    const small = voiceParamsFromRecipe(recipe({ headSize: 0.25 }));
    expect(big.formantF1Hz).toBeGreaterThan(small.formantF1Hz);
  });

  it("visor accessory lowers formantF2Hz (muffled)", () => {
    const withVisor = voiceParamsFromRecipe(recipe({ accessoryKinds: ["visor"] }));
    const noVisor = voiceParamsFromRecipe(recipe({ accessoryKinds: [] }));
    expect(withVisor.formantF2Hz).toBeLessThan(noVisor.formantF2Hz);
  });

  it("warm palette → higher formantQ than cool palette", () => {
    const warm = voiceParamsFromRecipe(recipe({ paletteName: "ember" }));
    const cool = voiceParamsFromRecipe(recipe({ paletteName: "mint" }));
    expect(warm.formantQ).toBeGreaterThan(cool.formantQ);
  });

  it("all three warm palettes produce higher formantQ than cool family average", () => {
    const warmFamilies = ["ember", "sand", "rose"];
    const coolFamilies = ["sky", "mint", "jade", "slate", "plum"];
    const warmQs = warmFamilies.map((p) => voiceParamsFromRecipe(recipe({ paletteName: p })).formantQ);
    const coolQs = coolFamilies.map((p) => voiceParamsFromRecipe(recipe({ paletteName: p })).formantQ);
    const warmAvg = warmQs.reduce((a, b) => a + b, 0) / warmQs.length;
    const coolAvg = coolQs.reduce((a, b) => a + b, 0) / coolQs.length;
    expect(warmAvg).toBeGreaterThan(coolAvg);
  });

  it("fins accessory increases vibrato Hz + depth", () => {
    const withFins = voiceParamsFromRecipe(recipe({ accessoryKinds: ["fins"] }));
    const noFins = voiceParamsFromRecipe(recipe({ accessoryKinds: [] }));
    expect(withFins.vibratoHz).toBeGreaterThan(noFins.vibratoHz);
    expect(withFins.vibratoDepth).toBeGreaterThan(noFins.vibratoDepth);
  });

  it("antennae accessory increases noiseMix (robotic)", () => {
    const withAnt = voiceParamsFromRecipe(recipe({ accessoryKinds: ["antennae"] }));
    const noAnt = voiceParamsFromRecipe(recipe({ accessoryKinds: [] }));
    expect(withAnt.noiseMix).toBeGreaterThan(noAnt.noiseMix);
  });

  it("cap accessory softens consonants (lower consonantStyle)", () => {
    const withCap = voiceParamsFromRecipe(recipe({ accessoryKinds: ["cap"] }));
    const noCap = voiceParamsFromRecipe(recipe({ accessoryKinds: [] }));
    expect(withCap.consonantStyle).toBeLessThan(noCap.consonantStyle);
  });

  it("hunter personality → faster pace than miner", () => {
    const hunter = voiceParamsFromRecipe(recipe({ botPersonality: "hunter" }));
    const miner = voiceParamsFromRecipe(recipe({ botPersonality: "miner" }));
    expect(hunter.phrasePaceMultiplier).toBeLessThan(miner.phrasePaceMultiplier);
  });

  it("seed jitter envelope: two recipes identical EXCEPT seed produce close but distinct voices", () => {
    const a = voiceParamsFromRecipe(recipe({ seed: "alpha" }));
    const b = voiceParamsFromRecipe(recipe({ seed: "beta" }));
    // basePitchHz seed jitter is ±5% → 5% of 170 (mid-range) = 8.5 Hz max diff.
    // Allow up to 30 Hz to be safe.
    expect(Math.abs(a.basePitchHz - b.basePitchHz)).toBeLessThan(30);
    // But the voices ARE distinct on at least one axis.
    const allKeys = Object.keys(a) as Array<keyof typeof a>;
    const distinct = allKeys.some((k) => a[k] !== b[k]);
    expect(distinct).toBe(true);
  });

  it("combination test: small + ember + antennae + cap (small, warm, robotic, friendly)", () => {
    const c = voiceParamsFromRecipe(recipe({
      torsoHeight: 0.35,
      headSize: 0.25,
      paletteName: "ember",
      accessoryKinds: ["antennae", "cap"]
    }));
    // Small bomber → high basePitchHz (top half).
    expect(c.basePitchHz).toBeGreaterThan(160);
    // Ember → high Q.
    expect(c.formantQ).toBeGreaterThan(8);
    // Antennae → high noise.
    expect(c.noiseMix).toBeGreaterThan(0.15);
    // Cap → soft consonants.
    expect(c.consonantStyle).toBeLessThan(0.55);
  });

  it("combination test: large + slate + backpack (big, cool, bassy)", () => {
    const c = voiceParamsFromRecipe(recipe({
      torsoHeight: 0.60,
      headSize: 0.45,
      paletteName: "slate",
      accessoryKinds: ["backpack"]
    }));
    // Big + backpack → very low basePitchHz.
    expect(c.basePitchHz).toBeLessThan(140);
    // Slate cool → low Q (jitter ±10% can land it just above the
    // cool-base lerp value; keep the bound generous).
    expect(c.formantQ).toBeLessThan(7);
  });

  it("all voice axes stay within their declared ranges", () => {
    const c = voiceParamsFromRecipe(recipe({
      torsoHeight: 1.0, // out of practical range
      headSize: 0.0,
      paletteName: "ember",
      accessoryKinds: ["backpack", "antennae", "fins", "visor", "cap"]
    }));
    expect(c.basePitchHz).toBeGreaterThanOrEqual(90);
    expect(c.basePitchHz).toBeLessThanOrEqual(260);
    expect(c.formantF1Hz).toBeGreaterThanOrEqual(300);
    expect(c.formantF1Hz).toBeLessThanOrEqual(900);
    expect(c.formantF2Hz).toBeGreaterThanOrEqual(1200);
    expect(c.formantF2Hz).toBeLessThanOrEqual(2400);
    expect(c.formantQ).toBeGreaterThanOrEqual(4);
    expect(c.formantQ).toBeLessThanOrEqual(12);
    expect(c.vibratoHz).toBeGreaterThanOrEqual(0);
    expect(c.vibratoHz).toBeLessThanOrEqual(8);
    expect(c.noiseMix).toBeGreaterThanOrEqual(0);
    expect(c.noiseMix).toBeLessThanOrEqual(0.4);
  });
});
