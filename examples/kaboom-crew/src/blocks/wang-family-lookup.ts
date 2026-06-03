// S170 KABOOM-WANG-INTEGRATION (GDP-2026-05-28-004 Stage 3) — Wang
// bitmask → mesh-variant lookup tables for the Kaboom Crew hard- and
// soft-block families. The engine ships 16 Wang variants per family
// (one per N/E/S/W neighbour bitmask), but Kaboom Crew only owns 4
// procedural mesh builders per family (S165). This module collapses
// the 16-entry Wang index into the matching 4-variant builder slot.
//
// S214 KABOOM-WANG-ROTATION (GDP-2026-05-29-004) — extends each
// entry with a canonical Y rotation so N/E/S/W edge cells use the
// SAME mesh oriented correctly. Variant 0 is authored at the
// 'N-edge' canonical pose (open face toward NORTH); the other three
// single-edge bitmasks rotate it 90°/180°/270°. Same idea for
// corners + T-junctions. Result: 16 visually distinct cells from
// 4 procedural builders, fixing the "набор кубов" feedback without
// any new mesh code.
//
// Variant role assignment (kept from S170):
//   0 → single-edge (canonical = N-edge)
//   1 → corner + T-junction (canonical = NW corner — open W + open N)
//   2 → surrounded filler (symmetric — rotation irrelevant)
//   3 → isolated (radially symmetric — rotation irrelevant)
//
// Straight-wall bitmasks 5 (E+W) and 10 (N+S) currently fall back to
// variant 1 (corner) with a best-effort rotation. Adding a 5th
// "straight wall" builder per family is deferred — see the GDP
// "Option A" path; tracked as a follow-up.

/** Variant index emitted by both lookup tables (matches the 4-variant builders). */
export type KaboomBlockVariantIndex = 0 | 1 | 2 | 3;

/** S214 — per-bitmask resolution: which builder + how much Y rotation. */
export type WangVariantResolution = {
  readonly variant: KaboomBlockVariantIndex;
  /** Y rotation in DEGREES applied at mesh-spawn so the canonical
   *  builder mesh orients to match the cell's actual bitmask. */
  readonly rotationYDeg: number;
};

// Bit layout reminder (engine bitmask convention):
//   N = 8, E = 4, S = 2, W = 1
//   bit SET = neighbour cell IS same-family.
// "Open face" = a cardinal direction without a same-family neighbour
// (where the mesh's edge detail should point).
const LOOKUP_TABLE: ReadonlyArray<WangVariantResolution> = Object.freeze([
  // 0  → isolated (no neighbours) → variant 3, symmetric.
  { variant: 3, rotationYDeg: 0 },
  // 1  → W neighbour, edge faces E (rotate canonical N-edge → +90°).
  { variant: 0, rotationYDeg: 90 },
  // 2  → S neighbour, edge faces N (rotate +180°).
  { variant: 0, rotationYDeg: 180 },
  // 3  → S + W neighbours → NE corner (open N + E). Canonical
  //      variant 1 is NW (open N + W); rotate +270° for NE.
  { variant: 1, rotationYDeg: 270 },
  // 4  → E neighbour, edge faces W (rotate +270°).
  { variant: 0, rotationYDeg: 270 },
  // 5  → E + W (straight horizontal wall — open N + S). Variant 1
  //      isn't ideal here; pick rotation 0 so the "corner" detail
  //      reads consistently with bitmask 10 (vertical wall).
  { variant: 1, rotationYDeg: 0 },
  // 6  → E + S → NW corner (open N + W) — canonical.
  { variant: 1, rotationYDeg: 0 },
  // 7  → E + S + W → T-junction open to N. Canonical variant 1
  //      orients its open-N side at rotation 0.
  { variant: 1, rotationYDeg: 0 },
  // 8  → N neighbour, edge faces S (canonical).
  { variant: 0, rotationYDeg: 0 },
  // 9  → N + W → SE corner (open S + E). Rotate +180°.
  { variant: 1, rotationYDeg: 180 },
  // 10 → N + S (straight vertical wall — open E + W). Rotate +90°
  //      so the "corner" detail reads as a vertical wall.
  { variant: 1, rotationYDeg: 90 },
  // 11 → N + S + W → T-junction open to E. Rotate +270°.
  { variant: 1, rotationYDeg: 270 },
  // 12 → N + E → SW corner (open S + W). Rotate +90°.
  { variant: 1, rotationYDeg: 90 },
  // 13 → N + E + W → T-junction open to S. Rotate +180°.
  { variant: 1, rotationYDeg: 180 },
  // 14 → N + E + S → T-junction open to W. Rotate +90°.
  { variant: 1, rotationYDeg: 90 },
  // 15 → surrounded → variant 2, symmetric.
  { variant: 2, rotationYDeg: 0 }
]);

/** Lookup the full resolution (variant + rotation) for a bitmask. */
export function resolveWangVariant(bitmask: number): WangVariantResolution {
  return LOOKUP_TABLE[clampBitmask(bitmask)]!;
}

/**
 * Map a 4-edge Wang bitmask (0..15) to one of the 4 hard-block builder
 * indices. Inputs outside the 0..15 range are clamped — defensive,
 * matches the engine resolver's `resolveVariantIndex` clamping.
 */
export function hardBlockBitmaskToVariant(bitmask: number): KaboomBlockVariantIndex {
  return LOOKUP_TABLE[clampBitmask(bitmask)]!.variant;
}

/**
 * Soft-block twin of `hardBlockBitmaskToVariant`. Same table — soft +
 * hard families share the 4-variant role assignment per the GDP.
 */
export function softBlockBitmaskToVariant(bitmask: number): KaboomBlockVariantIndex {
  return LOOKUP_TABLE[clampBitmask(bitmask)]!.variant;
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
  return LOOKUP_TABLE[clampBitmask(bitmask)]!.variant;
}

/**
 * S271 KABOOM-FLOOR-WANG-PATH — second terrain family added on top of
 * the S176 grass infrastructure. Re-uses the same 16→4 lookup table
 * because the role assignment (edge / corner / filler / isolated)
 * generalises across families.
 */
export function pathBitmaskToVariant(bitmask: number): KaboomBlockVariantIndex {
  return LOOKUP_TABLE[clampBitmask(bitmask)]!.variant;
}

/** S272 KABOOM-FLOOR-WANG-STONE — third terrain family. Same table. */
export function stoneBitmaskToVariant(bitmask: number): KaboomBlockVariantIndex {
  return LOOKUP_TABLE[clampBitmask(bitmask)]!.variant;
}

/** S272 KABOOM-FLOOR-WANG-DIRT — fourth terrain family. Same table. */
export function dirtBitmaskToVariant(bitmask: number): KaboomBlockVariantIndex {
  return LOOKUP_TABLE[clampBitmask(bitmask)]!.variant;
}

/**
 * S214 — Y rotation (degrees) for the same bitmask. Pulled out so
 * the variant index + the rotation can be cached independently in
 * the mesh-sync system.
 */
export function bitmaskToRotationYDeg(bitmask: number): number {
  return LOOKUP_TABLE[clampBitmask(bitmask)]!.rotationYDeg;
}

/**
 * Pure helper exposing the 16-entry lookup table. Useful for tests +
 * any debug surface that wants to inspect the full mapping without
 * invoking the functions 16 times.
 */
export function buildWangTo4LookupTable(): ReadonlyArray<KaboomBlockVariantIndex> {
  return LOOKUP_TABLE.map((e) => e.variant);
}

function clampBitmask(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 15) return 15;
  return value | 0;
}
