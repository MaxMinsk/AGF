// S165 KABOOM-MULTI-VARIANT-BLOCKS (GDP-2026-05-28-003) — per-cell
// deterministic variant selector. Hash (gx, gz, sceneSeed) → 0..3.
// Pure + deterministic so reloads of the same scene seed produce
// identical visuals.
//
// v1: uniform random distribution across the 4 variants.
// v2 (post-Wang autotile): the Wang resolver picks variant based on
// neighbour bitmask + uses this selector only as a tie-breaker fallback.

export type VariantIndex = 0 | 1 | 2 | 3;

/**
 * Deterministic hash → 0..3 for cell (gx, gz) in scene `sceneSeed`.
 *
 *   selectVariantIndex(5, 5, "seed-a") === selectVariantIndex(5, 5, "seed-a") // always
 *   selectVariantIndex(5, 5, "seed-a") MAY equal selectVariantIndex(6, 5, "seed-a")
 *
 * Output is uniform-ish across reasonable cell ranges — collisions are
 * not avoided since the goal is "looks varied", not "no two cells
 * share a variant".
 */
export function selectVariantIndex(
  gx: number,
  gz: number,
  sceneSeed: string
): VariantIndex {
  // Mix the seed string into a 32-bit integer (FNV-1a). The cell
  // coordinates are folded in afterwards using bit rotations + the
  // Murmur3 finalizer — the finalizer is critical because the
  // rotate-multiply alone leaves low bits sticky (constants here all
  // end in `...0001` so multiplied low bits stay zero).
  let h = fnv1a32(sceneSeed);
  h ^= Math.imul(gx | 0, 0x27d4eb2d);
  h = ((h << 13) | (h >>> 19)) >>> 0;
  h ^= Math.imul(gz | 0, 0x165667b1);
  h = ((h << 7) | (h >>> 25)) >>> 0;
  // Murmur3 finalizer — scrambles bits so the low 2 we sample below
  // reflect contributions from every part of the input.
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  // Sample 2 bits from the middle of the word — they're well-mixed
  // and avoid any residual structure at the LSB or MSB.
  return ((h >>> 14) & 0b11) as VariantIndex;
}

/**
 * Encode the seed fragment a procedural mesh ref carries. The mesh
 * ref looks like `procedural:kaboom-hard-block#<gx>,<gz>,<sceneSeed>`.
 * Parsing this back out in the registered builder lets the builder
 * call selectVariantIndex without re-hashing in the project-local
 * scene-load system.
 */
export function encodeBlockSeed(gx: number, gz: number, sceneSeed: string): string {
  return `${gx},${gz},${sceneSeed}`;
}

/**
 * Parse the encoded seed. Returns undefined if the fragment doesn't
 * match the expected format — callers should fall back to variant 0.
 */
export function decodeBlockSeed(seed: string): { gx: number; gz: number; sceneSeed: string } | undefined {
  if (seed === "" || seed === "default") return undefined;
  const firstComma = seed.indexOf(",");
  if (firstComma === -1) return undefined;
  const secondComma = seed.indexOf(",", firstComma + 1);
  if (secondComma === -1) return undefined;
  const gx = Number.parseInt(seed.slice(0, firstComma), 10);
  const gz = Number.parseInt(seed.slice(firstComma + 1, secondComma), 10);
  if (!Number.isFinite(gx) || !Number.isFinite(gz)) return undefined;
  return { gx, gz, sceneSeed: seed.slice(secondComma + 1) };
}

// ---- internal ----

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
