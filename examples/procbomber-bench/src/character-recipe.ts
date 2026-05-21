// S104 KABOOM-RECIPE-SCHEMA + KABOOM-RECIPE-CODEC.
//
// CharacterRecipe = the full bomber shape in one immutable JSON object.
// Drives the procbomber generator + Kaboom Crew migration. The shape
// mirrors schemas/character-recipe.schema.json — keep in sync if you
// rename anything here.
//
// Three pure functions live in this module:
//   - encodeRecipe(recipe) → base64-url-safe string (URL-transportable)
//   - decodeRecipe(string) → CharacterRecipe | undefined (validated;
//     undefined when malformed)
//   - resolveRecipeFromSeed(seed) → fully-populated CharacterRecipe
//     where every non-seed field is deterministically derived from the
//     seed string. Lets `?seed=hi` produce a complete bomber.
//
// No file-system I/O, no DOM, no Three.js — this is the kernel that
// the bench bootstrap (already using BenchState), the Kaboom Crew
// migration (S104-5), and the agent probes (deferred) will all consume.

import { BOMBER_MESH_DEFAULTS } from "./generators/bomber-mesh";
import {
  BOMBER_PALETTE_NAMES,
  isBomberPaletteName,
  type BomberPaletteName,
  type BomberPaletteOverrides
} from "./generators/bomber-palette";

export type BomberShape = "box" | "cylinder" | "capsule";

export type CharacterRecipe = {
  seed: string;
  headSize?: number;
  torsoHeight?: number;
  torsoWidth?: number;
  upperArmLength?: number;
  forearmLength?: number;
  armWidth?: number;
  upperLegLength?: number;
  lowerLegLength?: number;
  legWidth?: number;
  forwardTilt?: number;
  armRestAngle?: number;
  shoulderMountY?: number;
  shoulderMountZ?: number;
  hipMountY?: number;
  hipMountZ?: number;
  shoulderSpread?: number;
  hipSpread?: number;
  headShape?: BomberShape;
  torsoShape?: BomberShape;
  limbShape?: BomberShape;
  paletteName?: BomberPaletteName;
  paletteOverrides?: BomberPaletteOverrides;
};

/** Every field of CharacterRecipe in its post-resolution form (no optionals). */
export type ResolvedCharacterRecipe = Required<Omit<CharacterRecipe, "paletteOverrides">> & {
  paletteOverrides: BomberPaletteOverrides;
};

const SHAPE_OPTIONS: ReadonlyArray<BomberShape> = ["box", "cylinder", "capsule"];

// ---- seed-derived defaults --------------------------------------------------

// A 31-rotation hash on the seed string, advanced by stepping the
// pointer through one more character per call. Lets the resolver pull
// a stable stream of "noise bytes" from a single seed.
function makeSeedStream(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  let state = h | 0;
  return () => {
    // xorshift32 — small, fast, deterministic, good enough for visual variation.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff);
  };
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function pickEnum<T>(stream: () => number, choices: ReadonlyArray<T>): T {
  const idx = Math.min(choices.length - 1, Math.floor(stream() * choices.length));
  return choices[idx]!;
}

/** Fill every undefined field of `partial` from the seed. */
export function resolveRecipeFromSeed(seed: string, partial?: CharacterRecipe): ResolvedCharacterRecipe {
  const r = partial ?? { seed };
  const s = makeSeedStream(r.seed ?? seed);
  return {
    seed: r.seed ?? seed,
    headSize:       r.headSize       ?? lerp(0.25, 0.45, s()),
    torsoHeight:    r.torsoHeight    ?? lerp(0.35, 0.6, s()),
    torsoWidth:     r.torsoWidth     ?? lerp(0.35, 0.55, s()),
    upperArmLength: r.upperArmLength ?? lerp(0.12, 0.25, s()),
    forearmLength:  r.forearmLength  ?? lerp(0.12, 0.25, s()),
    armWidth:       r.armWidth       ?? lerp(0.1,  0.18, s()),
    upperLegLength: r.upperLegLength ?? lerp(0.12, 0.22, s()),
    lowerLegLength: r.lowerLegLength ?? lerp(0.12, 0.22, s()),
    legWidth:       r.legWidth       ?? lerp(0.12, 0.22, s()),
    forwardTilt:    r.forwardTilt    ?? lerp(-0.1, 0.15, s()),
    armRestAngle:   r.armRestAngle   ?? lerp(-0.1, 0.1, s()),
    shoulderMountY: r.shoulderMountY ?? lerp(-0.04, 0.04, s()),
    shoulderMountZ: r.shoulderMountZ ?? lerp(-0.03, 0.03, s()),
    hipMountY:      r.hipMountY      ?? lerp(-0.04, 0.04, s()),
    hipMountZ:      r.hipMountZ      ?? lerp(-0.03, 0.03, s()),
    shoulderSpread: r.shoulderSpread ?? lerp(0.85, 1.15, s()),
    hipSpread:      r.hipSpread      ?? lerp(0.7, 1.2, s()),
    headShape:      r.headShape      ?? pickEnum(s, SHAPE_OPTIONS),
    torsoShape:     r.torsoShape     ?? pickEnum(s, SHAPE_OPTIONS),
    limbShape:      r.limbShape      ?? pickEnum(s, SHAPE_OPTIONS),
    paletteName:    r.paletteName    ?? pickEnum(s, BOMBER_PALETTE_NAMES),
    paletteOverrides: r.paletteOverrides ?? {}
  };
}

/** Fill default values where the partial is missing them (no seed entropy). */
export function withRecipeDefaults(partial: CharacterRecipe): ResolvedCharacterRecipe {
  return {
    seed: partial.seed,
    headSize:       partial.headSize       ?? BOMBER_MESH_DEFAULTS.headSize,
    torsoHeight:    partial.torsoHeight    ?? BOMBER_MESH_DEFAULTS.torsoHeight,
    torsoWidth:     partial.torsoWidth     ?? BOMBER_MESH_DEFAULTS.torsoWidth,
    upperArmLength: partial.upperArmLength ?? BOMBER_MESH_DEFAULTS.upperArmLength,
    forearmLength:  partial.forearmLength  ?? BOMBER_MESH_DEFAULTS.forearmLength,
    armWidth:       partial.armWidth       ?? BOMBER_MESH_DEFAULTS.armWidth,
    upperLegLength: partial.upperLegLength ?? BOMBER_MESH_DEFAULTS.upperLegLength,
    lowerLegLength: partial.lowerLegLength ?? BOMBER_MESH_DEFAULTS.lowerLegLength,
    legWidth:       partial.legWidth       ?? BOMBER_MESH_DEFAULTS.legWidth,
    forwardTilt:    partial.forwardTilt    ?? 0,
    armRestAngle:   partial.armRestAngle   ?? 0,
    shoulderMountY: partial.shoulderMountY ?? 0,
    shoulderMountZ: partial.shoulderMountZ ?? 0,
    hipMountY:      partial.hipMountY      ?? 0,
    hipMountZ:      partial.hipMountZ      ?? 0,
    shoulderSpread: partial.shoulderSpread ?? 1,
    hipSpread:      partial.hipSpread      ?? 1,
    headShape:      partial.headShape      ?? "box",
    torsoShape:     partial.torsoShape     ?? "box",
    limbShape:      partial.limbShape      ?? "box",
    paletteName:    partial.paletteName    ?? "sky",
    paletteOverrides: partial.paletteOverrides ?? {}
  };
}

// ---- codec ------------------------------------------------------------------

function isShape(value: unknown): value is BomberShape {
  return typeof value === "string" && (SHAPE_OPTIONS as ReadonlyArray<string>).includes(value);
}

/** Best-effort runtime validation. Returns the recipe or undefined. */
export function validateRecipe(value: unknown): CharacterRecipe | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v["seed"] !== "string" || v["seed"].length === 0) return undefined;
  const checkNumber = (k: string): boolean => {
    if (!(k in v)) return true;
    return typeof v[k] === "number" && Number.isFinite(v[k] as number);
  };
  const numericKeys = [
    "headSize", "torsoHeight", "torsoWidth",
    "upperArmLength", "forearmLength", "armWidth",
    "upperLegLength", "lowerLegLength", "legWidth",
    "forwardTilt", "armRestAngle",
    "shoulderMountY", "shoulderMountZ", "hipMountY", "hipMountZ",
    "shoulderSpread", "hipSpread"
  ];
  for (const k of numericKeys) if (!checkNumber(k)) return undefined;
  for (const k of ["headShape", "torsoShape", "limbShape"]) {
    if (k in v && !isShape(v[k])) return undefined;
  }
  if ("paletteName" in v && !isBomberPaletteName(v["paletteName"])) return undefined;
  if ("paletteOverrides" in v) {
    const po = v["paletteOverrides"];
    if (po === null || typeof po !== "object") return undefined;
    for (const [pk, pv] of Object.entries(po as Record<string, unknown>)) {
      if (typeof pv !== "string" || !/^#[0-9a-fA-F]{6}$/.test(pv)) return undefined;
      void pk; // channel name not strictly validated here.
    }
  }
  return v as CharacterRecipe;
}

/** Base64-URL-safe encoder — no `=` padding, no `+`/`/`. */
function base64UrlEncode(text: string): string {
  // btoa is available in both browser + Node 18+.
  const b64 = (typeof btoa === "function")
    ? btoa(unescape(encodeURIComponent(text)))
    : Buffer.from(text, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): string | undefined {
  try {
    let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    if (typeof atob === "function") {
      return decodeURIComponent(escape(atob(b64)));
    }
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return undefined;
  }
}

export function encodeRecipe(recipe: CharacterRecipe): string {
  return base64UrlEncode(JSON.stringify(recipe));
}

export function decodeRecipe(s: string): CharacterRecipe | undefined {
  const json = base64UrlDecode(s);
  if (json === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  return validateRecipe(parsed);
}
