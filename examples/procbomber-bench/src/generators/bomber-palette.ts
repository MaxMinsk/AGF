// S101 + S102 PROCBOMBER-PALETTE-8CH — eight named palettes, seeded
// picker, 8 channel mapping (one channel per post-decomposition body
// part) + derived bottom-shadow tints for the contact-shadow trick.
//
// Channel layout (mapped 1:1 onto the GDP-2026-05-21-001 mesh tree):
//   head        → head mesh
//   torsoTop    → torso mesh (front-facing vertices) — primary identity color
//   torsoBottom → torso mesh (bottom-facing vertices) — darker variant for AO
//   upperArm    → upperArm.l + upperArm.r
//   forearm     → forearm.l + forearm.r
//   upperLeg    → upperLeg.l + upperLeg.r
//   lowerLeg    → lowerLeg.l + lowerLeg.r
//   accent      → reserved for future helmet stripe / chest emblem layer

export type BomberPalette = {
  name: BomberPaletteName;
  head: string;
  /** Primary torso identity color. */
  torsoTop: string;
  /** Darker torso variant used for the bottom-shadow split. Derived by default. */
  torsoBottom: string;
  upperArm: string;
  forearm: string;
  upperLeg: string;
  lowerLeg: string;
  /** Reserved for chest emblem / helmet stripe layer (GDP-2026-05-21-004). */
  accent: string;
};

export type BomberPaletteName =
  | "sky"
  | "ember"
  | "mint"
  | "plum"
  | "sand"
  | "jade"
  | "rose"
  | "slate";

/**
 * Derive a darker shadow tint from a base color. Used as the default
 * for torsoBottom / shadowed arm + leg sections + the contact-shadow
 * split on the bottom 30% of any body part. The factor 0.55 keeps the
 * derived color visibly darker than the base but stays in the same hue.
 *
 * Math runs directly on the sRGB byte values so the output matches what
 * a designer expects when multiplying their hex picker — Three.js
 * Color's `multiplyScalar` would round-trip through linear space and
 * land on a brighter value than intuitively expected.
 */
export function bottomShadow(hex: string, factor = 0.55): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((n & 0xff) * factor)));
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

type CorePalette = {
  name: BomberPaletteName;
  head: string;
  torsoTop: string;
  upperArm: string;
  upperLeg: string;
  accent: string;
};

const CORES: ReadonlyArray<CorePalette> = [
  { name: "sky",   head: "#7fc7ff", torsoTop: "#3ab0ff", upperArm: "#2780bf", upperLeg: "#1f6294", accent: "#ffd24a" },
  { name: "ember", head: "#ff9874", torsoTop: "#e65a3a", upperArm: "#a23519", upperLeg: "#7d2510", accent: "#ffe181" },
  { name: "mint",  head: "#aef0c8", torsoTop: "#3fbf83", upperArm: "#2d8b5f", upperLeg: "#1f6b48", accent: "#fff2c6" },
  { name: "plum",  head: "#c79bd9", torsoTop: "#823fa8", upperArm: "#5b2778", upperLeg: "#421b58", accent: "#ffce6e" },
  { name: "sand",  head: "#f0d59a", torsoTop: "#c9a14d", upperArm: "#8a6d30", upperLeg: "#5f4a20", accent: "#4a3d22" },
  { name: "jade",  head: "#a8d6c7", torsoTop: "#3f9f87", upperArm: "#286e5e", upperLeg: "#1c5044", accent: "#f0e3a8" },
  { name: "rose",  head: "#ffb7c5", torsoTop: "#e8546b", upperArm: "#9c2c41", upperLeg: "#741e30", accent: "#fff0d2" },
  { name: "slate", head: "#c2cad6", torsoTop: "#5a6a82", upperArm: "#3a4659", upperLeg: "#2a3344", accent: "#ffb24a" }
];

function expand(core: CorePalette): BomberPalette {
  return {
    name: core.name,
    head: core.head,
    torsoTop: core.torsoTop,
    torsoBottom: bottomShadow(core.torsoTop),
    upperArm: core.upperArm,
    forearm: bottomShadow(core.upperArm, 0.85),
    upperLeg: core.upperLeg,
    lowerLeg: bottomShadow(core.upperLeg, 0.85),
    accent: core.accent
  };
}

export const BOMBER_PALETTES: ReadonlyArray<BomberPalette> = CORES.map(expand);

export const BOMBER_PALETTE_NAMES: ReadonlyArray<BomberPaletteName> =
  BOMBER_PALETTES.map((p) => p.name);

export type BomberPaletteOverrides = Partial<Omit<BomberPalette, "name">>;

export function isBomberPaletteName(value: unknown): value is BomberPaletteName {
  return typeof value === "string" && (BOMBER_PALETTE_NAMES as ReadonlyArray<string>).includes(value);
}

export function paletteByName(name: BomberPaletteName): BomberPalette {
  const found = BOMBER_PALETTES.find((p) => p.name === name);
  if (found === undefined) throw new Error(`bomber palette '${name}' not found`);
  return found;
}

/**
 * Apply per-channel overrides on top of a base palette. Lets a recipe
 * paint just the helmet without touching the rest. Pass-through for
 * channels left undefined.
 */
export function applyPaletteOverrides(
  base: BomberPalette,
  overrides: BomberPaletteOverrides | undefined
): BomberPalette {
  if (overrides === undefined) return base;
  return {
    name: base.name,
    head: overrides.head ?? base.head,
    torsoTop: overrides.torsoTop ?? base.torsoTop,
    torsoBottom: overrides.torsoBottom ?? base.torsoBottom,
    upperArm: overrides.upperArm ?? base.upperArm,
    forearm: overrides.forearm ?? base.forearm,
    upperLeg: overrides.upperLeg ?? base.upperLeg,
    lowerLeg: overrides.lowerLeg ?? base.lowerLeg,
    accent: overrides.accent ?? base.accent
  };
}

/**
 * Pick a palette from a seed hash. The seed is opaque to this function;
 * any string yields one of the 8 palettes deterministically. An optional
 * `override` short-circuits the seed picker when a player has explicitly
 * chosen a palette (e.g. via the `?bomberPalette=` URL knob).
 */
export function pickBomberPalette(seedHash: string, override?: BomberPaletteName): BomberPalette {
  if (override !== undefined) return paletteByName(override);
  let h = 0;
  for (let i = 0; i < seedHash.length; i += 1) {
    h = (h * 31 + seedHash.charCodeAt(i)) | 0;
  }
  const idx = ((h % BOMBER_PALETTES.length) + BOMBER_PALETTES.length) % BOMBER_PALETTES.length;
  return BOMBER_PALETTES[idx]!;
}
