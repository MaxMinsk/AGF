// S171 KABOOM-ARENA-THEMES MVP (GDP-2026-05-28-013).
//
// Per-arena visual themes — five starter themes that change an arena's
// identity by recolouring the floor (v1 scope). Each theme bundles a
// palette + lighting tint + Wang family map, but only the floor primary
// hex is wired in this MVP — the rest of the fields are authored now so
// the data is in place when the lighting + Wang re-tint follow-ups ship.
//
// OUT OF SCOPE for the MVP (see GDP "OUT OF SCOPE" list):
//   - directional / ambient light tinting (no lighting module yet).
//   - hard / soft block palette re-tinting (would need to parameterise
//     the S165 variant builders).
//   - bench theme dropdown.
//   - multiplayer worldConfig.theme.
//   - Wang family floor-colour re-tinting.
//
// The runtime entry point is arena-theme-apply-system: at scene-load it
// reads ArenaTheme.themeKey from the kaboom.game-state singleton, looks
// up the theme here, and writes MeshRenderer.color on the floor entity.
//
// URL flag `?theme=warehouse|factory|dock|lab|bunker` overrides the
// scene default; see bootstrap.ts#readArenaThemeFromUrl.

export type ArenaThemeKey =
  | "warehouse"
  | "factory"
  | "dock"
  | "lab"
  | "bunker";

export type BlockPalette = {
  readonly primary: string;
  readonly accent: string;
};

export type FloorWangFamilyKeys = {
  readonly default: string;
  readonly wallShadow: string;
};

export type DirectionalLightTint = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

export type ArenaTheme = {
  readonly key: ArenaThemeKey;
  /** Primary floor colour applied to the floor entity's MeshRenderer.color. */
  readonly floorPrimaryHex: string;
  readonly hardBlockPalette: BlockPalette;
  readonly softBlockPalette: BlockPalette;
  readonly accentEmissive: string;
  readonly skyColor: string;
  readonly ambientHemisphericSky: string;
  readonly ambientHemisphericGround: string;
  readonly directionalLightTint: DirectionalLightTint;
  readonly floorWangFamilyKeys: FloorWangFamilyKeys;
};

/**
 * Static registry — projects choose from the 5 themes registered here,
 * they don't author themes per-arena. Hex values come straight from the
 * GDP (`backlog/proposed-stories/GDP-2026-05-28-013.story-proposal.json`)
 * — keep them in sync with that file when ratifying.
 */
export const ARENA_THEMES: Readonly<Record<ArenaThemeKey, ArenaTheme>> = Object.freeze({
  warehouse: {
    key: "warehouse",
    floorPrimaryHex: "#6a6258",
    hardBlockPalette: { primary: "#7a7570", accent: "#d97a2e" },
    softBlockPalette: { primary: "#8a6535", accent: "#d9b15a" },
    accentEmissive: "#33ffff",
    skyColor: "#5a6878",
    ambientHemisphericSky: "#786c5e",
    ambientHemisphericGround: "#2e2820",
    directionalLightTint: { r: 1.0, g: 0.97, b: 0.9 },
    floorWangFamilyKeys: { default: "floor", wallShadow: "wall-shadow" }
  },
  factory: {
    key: "factory",
    floorPrimaryHex: "#5a3a2a",
    hardBlockPalette: { primary: "#6e5040", accent: "#d04020" },
    softBlockPalette: { primary: "#a86840", accent: "#604030" },
    accentEmissive: "#ff4444",
    skyColor: "#4a3528",
    ambientHemisphericSky: "#695445",
    ambientHemisphericGround: "#2a1f15",
    directionalLightTint: { r: 1.0, g: 0.92, b: 0.8 },
    floorWangFamilyKeys: { default: "floor", wallShadow: "wall-shadow" }
  },
  dock: {
    key: "dock",
    floorPrimaryHex: "#5e4a2e",
    hardBlockPalette: { primary: "#4a3a25", accent: "#708090" },
    softBlockPalette: { primary: "#7e6240", accent: "#382820" },
    accentEmissive: "#66bbff",
    skyColor: "#6878a0",
    ambientHemisphericSky: "#587090",
    ambientHemisphericGround: "#353030",
    directionalLightTint: { r: 0.95, g: 0.97, b: 1.0 },
    floorWangFamilyKeys: { default: "floor", wallShadow: "wall-shadow" }
  },
  lab: {
    key: "lab",
    floorPrimaryHex: "#e0e2e6",
    hardBlockPalette: { primary: "#d8dade", accent: "#4080ff" },
    softBlockPalette: { primary: "#c4c8d0", accent: "#5090ff" },
    accentEmissive: "#33ffff",
    skyColor: "#c0c8d6",
    ambientHemisphericSky: "#b4c0d0",
    ambientHemisphericGround: "#6a7080",
    directionalLightTint: { r: 0.92, g: 0.95, b: 1.0 },
    floorWangFamilyKeys: { default: "floor", wallShadow: "wall-shadow" }
  },
  bunker: {
    key: "bunker",
    floorPrimaryHex: "#4a4a3e",
    hardBlockPalette: { primary: "#58584a", accent: "#989878" },
    softBlockPalette: { primary: "#6a624a", accent: "#38382e" },
    accentEmissive: "#ffaa44",
    skyColor: "#353528",
    ambientHemisphericSky: "#383528",
    ambientHemisphericGround: "#1a1812",
    directionalLightTint: { r: 0.85, g: 0.83, b: 0.74 },
    floorWangFamilyKeys: { default: "floor", wallShadow: "wall-shadow" }
  }
});

/**
 * Default theme assignment per arena scene id. Scenes can override via
 * a future scene-level field; today the URL flag `?theme=` and this
 * table are the only inputs.
 *
 *   default  → warehouse  (introductory experience)
 *   wide     → warehouse  (same theme, larger floor)
 *   corridor → bunker     (drab, claustrophobic)
 *   plaza    → lab        (open, clean)
 *   cross    → factory    (industrial centre)
 *   pit      → dock       (cliff-like, weathered)
 *
 * Other arenas not listed here (`start`, `belt-zone`, `warpfield`,
 * `plate-puzzle`) fall back to warehouse via the resolver below.
 */
export const ARENA_DEFAULT_THEME: Readonly<Record<string, ArenaThemeKey>> = Object.freeze({
  default: "warehouse",
  wide: "warehouse",
  corridor: "bunker",
  plaza: "lab",
  cross: "factory",
  pit: "dock"
});

const ARENA_THEME_KEY_SET: ReadonlySet<ArenaThemeKey> = new Set<ArenaThemeKey>([
  "warehouse",
  "factory",
  "dock",
  "lab",
  "bunker"
]);

/** Returns true if `value` is one of the registered theme keys. Useful
 * for narrowing URL / scene-input strings before passing to lookup. */
export function isArenaThemeKey(value: unknown): value is ArenaThemeKey {
  return typeof value === "string" && ARENA_THEME_KEY_SET.has(value as ArenaThemeKey);
}

/** Look up a registered theme by key. Returns undefined for unknown keys
 * — callers should fall back to `ARENA_THEMES.warehouse` (the MVP
 * default; see arena-theme-apply-system). */
export function getArenaTheme(key: ArenaThemeKey): ArenaTheme {
  return ARENA_THEMES[key];
}

/** Enumerate every registered theme key (ordered as authored). Used by
 * tests + the future bench dropdown. */
export function listArenaThemeKeys(): ReadonlyArray<ArenaThemeKey> {
  return ["warehouse", "factory", "dock", "lab", "bunker"];
}

/** Resolve the default theme for a given arena/scene id. Returns
 * "warehouse" for unknown ids — the most neutral fallback. */
export function defaultThemeForArena(arenaId: string): ArenaThemeKey {
  return ARENA_DEFAULT_THEME[arenaId] ?? "warehouse";
}
