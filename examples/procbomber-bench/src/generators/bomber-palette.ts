// S101 PROCBOMBER-PALETTE-TABLE — eight named palettes + seeded picker.
//
// Each palette is `{ head, torso, limbs, accent }` hex strings. The
// generator (see `bomber-mesh.ts`) drives per-part vertex colors from
// this table. Naming is a human handle (`?bomberPalette=sky` URL
// override resolves through `palettesByName`); the seeded picker is
// what randomized bots use to vary their look without coordination.

export type BomberPalette = {
  name: BomberPaletteName;
  head: string;
  torso: string;
  limbs: string;
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

export const BOMBER_PALETTES: ReadonlyArray<BomberPalette> = [
  { name: "sky",   head: "#7fc7ff", torso: "#3ab0ff", limbs: "#2780bf", accent: "#ffd24a" },
  { name: "ember", head: "#ff9874", torso: "#e65a3a", limbs: "#a23519", accent: "#ffe181" },
  { name: "mint",  head: "#aef0c8", torso: "#3fbf83", limbs: "#2d8b5f", accent: "#fff2c6" },
  { name: "plum",  head: "#c79bd9", torso: "#823fa8", limbs: "#5b2778", accent: "#ffce6e" },
  { name: "sand",  head: "#f0d59a", torso: "#c9a14d", limbs: "#8a6d30", accent: "#4a3d22" },
  { name: "jade",  head: "#a8d6c7", torso: "#3f9f87", limbs: "#286e5e", accent: "#f0e3a8" },
  { name: "rose",  head: "#ffb7c5", torso: "#e8546b", limbs: "#9c2c41", accent: "#fff0d2" },
  { name: "slate", head: "#c2cad6", torso: "#5a6a82", limbs: "#3a4659", accent: "#ffb24a" }
];

export const BOMBER_PALETTE_NAMES: ReadonlyArray<BomberPaletteName> =
  BOMBER_PALETTES.map((p) => p.name);

export function isBomberPaletteName(value: unknown): value is BomberPaletteName {
  return typeof value === "string" && (BOMBER_PALETTE_NAMES as ReadonlyArray<string>).includes(value);
}

export function paletteByName(name: BomberPaletteName): BomberPalette {
  const found = BOMBER_PALETTES.find((p) => p.name === name);
  // BOMBER_PALETTES is the source of truth — if `name` typechecks as
  // BomberPaletteName, the lookup cannot miss. The throw is purely a
  // belt-and-suspenders for `as` casts at consumer boundaries.
  if (found === undefined) throw new Error(`bomber palette '${name}' not found`);
  return found;
}

/**
 * Pick a palette from a seed hash. The seed is opaque to this function —
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
