// S190 — directionalLightTint (r/g/b in [0,1]) converts to a hex
// string by treating it as a multiplier against pure white. Used by
// startArenaLightApplyPoller to tint light.sun per active theme.

import { describe, expect, it } from "vitest";

import { tintToHex } from "../../src/systems/arena-theme-apply-system";
import { ARENA_THEMES } from "../../src/themes/theme-table";

describe("tintToHex (S190)", () => {
  it("pure-white tint (1,1,1) → #ffffff", () => {
    expect(tintToHex({ r: 1, g: 1, b: 1 })).toBe("#ffffff");
  });

  it("pure-black tint (0,0,0) → #000000", () => {
    expect(tintToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
  });

  it("half-tint (0.5,0.5,0.5) → mid-grey", () => {
    expect(tintToHex({ r: 0.5, g: 0.5, b: 0.5 })).toBe("#808080");
  });

  it("clamps out-of-range channels", () => {
    expect(tintToHex({ r: 1.5, g: -0.2, b: 0.5 })).toBe("#ff0080");
  });

  it("warehouse tint produces a slightly-warm white", () => {
    const hex = tintToHex(ARENA_THEMES.warehouse.directionalLightTint);
    // Warehouse {1.0, 0.97, 0.9} → ff f7 e6
    expect(hex).toBe("#fff7e6");
  });

  it("lab tint produces a slightly-cool blue-white", () => {
    const hex = tintToHex(ARENA_THEMES.lab.directionalLightTint);
    // Lab {0.92, 0.95, 1.0} → eb f2 ff
    expect(hex).toBe("#ebf2ff");
  });

  it("bunker tint produces a dim warm-olive", () => {
    const hex = tintToHex(ARENA_THEMES.bunker.directionalLightTint);
    // Bunker {0.85, 0.83, 0.74} → d9 d4 bd
    expect(hex).toBe("#d9d4bd");
  });

  it("every registered theme has a non-default tint hex (or matches white if neutral)", () => {
    for (const theme of Object.values(ARENA_THEMES)) {
      const hex = tintToHex(theme.directionalLightTint);
      // Hex always 7 chars; must parse cleanly.
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
