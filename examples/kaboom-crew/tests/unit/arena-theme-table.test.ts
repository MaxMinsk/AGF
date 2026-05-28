// S171 KABOOM-ARENA-THEMES MVP (GDP-2026-05-28-013) — table coverage.

import { describe, expect, it } from "vitest";

import {
  ARENA_DEFAULT_THEME,
  ARENA_THEMES,
  defaultThemeForArena,
  getArenaTheme,
  isArenaThemeKey,
  listArenaThemeKeys,
  type ArenaThemeKey
} from "../../src/themes/theme-table";

const HEX_PATTERN = /^#[0-9a-f]{6}$/;

const ALL_KEYS: ReadonlyArray<ArenaThemeKey> = [
  "warehouse",
  "factory",
  "dock",
  "lab",
  "bunker"
];

describe("ARENA_THEMES registry (S171 GDP-013)", () => {
  it("registers all 5 theme keys", () => {
    for (const key of ALL_KEYS) {
      const theme = ARENA_THEMES[key];
      expect(theme).toBeDefined();
      expect(theme.key).toBe(key);
    }
  });

  it("listArenaThemeKeys returns the 5 registered keys", () => {
    const keys = listArenaThemeKeys();
    expect(keys).toHaveLength(5);
    expect(new Set(keys)).toEqual(new Set(ALL_KEYS));
  });

  it("getArenaTheme returns the same record as ARENA_THEMES[key]", () => {
    for (const key of ALL_KEYS) {
      expect(getArenaTheme(key)).toBe(ARENA_THEMES[key]);
    }
  });

  it("isArenaThemeKey narrows known + rejects unknown values", () => {
    for (const key of ALL_KEYS) expect(isArenaThemeKey(key)).toBe(true);
    expect(isArenaThemeKey("nope")).toBe(false);
    expect(isArenaThemeKey("")).toBe(false);
    expect(isArenaThemeKey(undefined)).toBe(false);
    expect(isArenaThemeKey(null)).toBe(false);
    expect(isArenaThemeKey(42)).toBe(false);
  });
});

describe("ARENA_THEMES hex validity (S171 GDP-013)", () => {
  function expectValidHex(label: string, value: string): void {
    expect(HEX_PATTERN.test(value), `${label} = '${value}'`).toBe(true);
  }

  it("every theme's hex fields are valid #RRGGBB strings", () => {
    for (const key of ALL_KEYS) {
      const theme = ARENA_THEMES[key];
      expectValidHex(`${key}.floorPrimaryHex`, theme.floorPrimaryHex);
      expectValidHex(`${key}.hardBlockPalette.primary`, theme.hardBlockPalette.primary);
      expectValidHex(`${key}.hardBlockPalette.accent`, theme.hardBlockPalette.accent);
      expectValidHex(`${key}.softBlockPalette.primary`, theme.softBlockPalette.primary);
      expectValidHex(`${key}.softBlockPalette.accent`, theme.softBlockPalette.accent);
      expectValidHex(`${key}.accentEmissive`, theme.accentEmissive);
      expectValidHex(`${key}.skyColor`, theme.skyColor);
      expectValidHex(`${key}.ambientHemisphericSky`, theme.ambientHemisphericSky);
      expectValidHex(`${key}.ambientHemisphericGround`, theme.ambientHemisphericGround);
    }
  });

  it("every theme's directional-light tint is in [0, 1] per channel", () => {
    for (const key of ALL_KEYS) {
      const t = ARENA_THEMES[key].directionalLightTint;
      for (const [channel, v] of [["r", t.r], ["g", t.g], ["b", t.b]] as const) {
        expect(v, `${key}.directionalLightTint.${channel}`).toBeGreaterThanOrEqual(0);
        expect(v, `${key}.directionalLightTint.${channel}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("hex codes match the GDP-2026-05-28-013 ratified palette", () => {
    // Sanity-check a sample from each theme so accidental edits to the
    // table fail the suite. Not exhaustive — the GDP JSON is the
    // canonical source.
    expect(ARENA_THEMES.warehouse.floorPrimaryHex).toBe("#6a6258");
    expect(ARENA_THEMES.factory.floorPrimaryHex).toBe("#5a3a2a");
    expect(ARENA_THEMES.dock.floorPrimaryHex).toBe("#5e4a2e");
    expect(ARENA_THEMES.lab.floorPrimaryHex).toBe("#e0e2e6");
    expect(ARENA_THEMES.bunker.floorPrimaryHex).toBe("#4a4a3e");
  });
});

describe("ARENA_DEFAULT_THEME mapping (S171 GDP-013)", () => {
  it("maps the 6 declared arenas to sensible theme keys", () => {
    expect(ARENA_DEFAULT_THEME["default"]).toBe("warehouse");
    expect(ARENA_DEFAULT_THEME["wide"]).toBe("warehouse");
    expect(ARENA_DEFAULT_THEME["corridor"]).toBe("bunker");
    expect(ARENA_DEFAULT_THEME["plaza"]).toBe("lab");
    expect(ARENA_DEFAULT_THEME["cross"]).toBe("factory");
    expect(ARENA_DEFAULT_THEME["pit"]).toBe("dock");
  });

  it("defaultThemeForArena returns the mapped key for declared arenas", () => {
    expect(defaultThemeForArena("corridor")).toBe("bunker");
    expect(defaultThemeForArena("plaza")).toBe("lab");
    expect(defaultThemeForArena("cross")).toBe("factory");
    expect(defaultThemeForArena("pit")).toBe("dock");
  });

  it("defaultThemeForArena falls back to warehouse for unknown arenas", () => {
    expect(defaultThemeForArena("start")).toBe("warehouse");
    expect(defaultThemeForArena("belt-zone")).toBe("warehouse");
    expect(defaultThemeForArena("nope")).toBe("warehouse");
    expect(defaultThemeForArena("")).toBe("warehouse");
  });

  it("every default-mapped value is a registered theme key", () => {
    for (const value of Object.values(ARENA_DEFAULT_THEME)) {
      expect(isArenaThemeKey(value)).toBe(true);
    }
  });
});
