// S170 KABOOM-WANG-INTEGRATION (GDP-2026-05-28-004 Stage 3) — Wang
// bitmask → mesh-variant lookup tables for the Kaboom Crew hard- and
// soft-block families. The engine ships 16 Wang variants per family
// (one per N/E/S/W neighbour bitmask), but Kaboom Crew only owns 4
// procedural mesh builders per family (S165). This module collapses
// the 16-entry Wang index into the matching 4-variant builder slot.
//
// Lookup table per the GDP:
//   bitmask 0                       (isolated)       → variant 3
//   bitmask 1, 2, 4, 8              (single-edge)    → variant 0
//   bitmask 3, 5, 6, 9, 10, 12      (two-edge)       → variant 1
//   bitmask 7, 11, 13, 14           (T-junction)     → variant 1
//   bitmask 15                      (surrounded)     → variant 2
//
// Both hard-block + soft-block families use the SAME table — the four
// builders share a "0=edge / 1=corner+T / 2=filler / 3=isolated" role
// assignment by design (visual-style decision in the GDP).

/** Variant index emitted by both lookup tables (matches the 4-variant builders). */
export type KaboomBlockVariantIndex = 0 | 1 | 2 | 3;

const LOOKUP_TABLE: ReadonlyArray<KaboomBlockVariantIndex> = Object.freeze([
  // 0  → isolated      → 3
  3,
  // 1  → W only        → 0 (single-edge)
  0,
  // 2  → S only        → 0
  0,
  // 3  → S + W         → 1 (corner)
  1,
  // 4  → E only        → 0
  0,
  // 5  → E + W         → 1 (two-edge)
  1,
  // 6  → E + S         → 1 (corner)
  1,
  // 7  → E + S + W     → 1 (T-junction)
  1,
  // 8  → N only        → 0
  0,
  // 9  → N + W         → 1 (corner)
  1,
  // 10 → N + S         → 1 (two-edge)
  1,
  // 11 → N + S + W     → 1 (T-junction)
  1,
  // 12 → N + E         → 1 (corner)
  1,
  // 13 → N + E + W     → 1 (T-junction)
  1,
  // 14 → N + E + S     → 1 (T-junction)
  1,
  // 15 → surrounded    → 2 (filler)
  2
]);

/**
 * Map a 4-edge Wang bitmask (0..15) to one of the 4 hard-block builder
 * indices. Inputs outside the 0..15 range are clamped — defensive,
 * matches the engine resolver's `resolveVariantIndex` clamping.
 */
export function hardBlockBitmaskToVariant(bitmask: number): KaboomBlockVariantIndex {
  return LOOKUP_TABLE[clampBitmask(bitmask)]!;
}

/**
 * Soft-block twin of `hardBlockBitmaskToVariant`. Same table — soft +
 * hard families share the 4-variant role assignment per the GDP.
 */
export function softBlockBitmaskToVariant(bitmask: number): KaboomBlockVariantIndex {
  return LOOKUP_TABLE[clampBitmask(bitmask)]!;
}

/**
 * S176 KABOOM-FLOOR-WANG-TILES MVP (GDP-2026-05-28-012) — grass twin
 * of `hardBlockBitmaskToVariant`. Re-uses the SAME 16→4 lookup table:
 * the grass interior (bitmask 15 — surrounded by grass) maps to the
 * filler variant; isolated grass tiles map to the isolated variant;
 * edge bitmasks map to the edge / corner / T-junction variants. v1
 * deliberately re-uses the table to keep the contract identical to
 * the hard / soft block families — a follow-up sprint can split the
 * grass table out if a different visual mapping is needed.
 */
export function grassBitmaskToVariant(bitmask: number): KaboomBlockVariantIndex {
  return LOOKUP_TABLE[clampBitmask(bitmask)]!;
}

/**
 * Pure helper exposing the 16-entry lookup table. Useful for tests +
 * any debug surface that wants to inspect the full mapping without
 * invoking the functions 16 times.
 */
export function buildWangTo4LookupTable(): ReadonlyArray<KaboomBlockVariantIndex> {
  return LOOKUP_TABLE;
}

function clampBitmask(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 15) return 15;
  return value | 0;
}
