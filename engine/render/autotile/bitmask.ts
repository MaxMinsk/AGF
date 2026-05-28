// S169 ENGINE-WANG-AUTOTILE (GDP-2026-05-28-002) — bitmask helpers.
//
// Pure neighbourhood-to-bitmask reduction + variant lookup. No
// dependencies on World / ECS — the caller supplies a predicate that
// answers "is the cell at (gx, gz) the same family?" so the engine
// stays agnostic to how projects encode family membership (the
// generic `WangTileFamilyMember` tag, or a project-specific
// `SoftBlock` component, etc.).
//
// Bitmask encoding (matches `docs/game-design/wang-tile-autotile-design.md` §3):
//   bit 3 (8) = north neighbour (gz - 1) is same family
//   bit 2 (4) = east  neighbour (gx + 1) is same family
//   bit 1 (2) = south neighbour (gz + 1) is same family
//   bit 0 (1) = west  neighbour (gx - 1) is same family

import type { WangTileFamily, WangTileVariant } from "./family-registry";

/** Predicate signature: returns true when the cell at (gx, gz) is the same Wang family. */
export type SameFamilyPredicate = (gx: number, gz: number) => boolean;

/**
 * Compute the 4-edge Wang bitmask (0..15) for the cell at (cellGx,
 * cellGz). The predicate is invoked four times — once per cardinal
 * neighbour. The cell itself is not queried; the caller decides
 * whether to short-circuit when the cell is not a family member.
 */
export function computeWangBitmask(
  cellGx: number,
  cellGz: number,
  sameFamily: SameFamilyPredicate
): number {
  let mask = 0;
  if (sameFamily(cellGx, cellGz - 1)) mask |= 0b1000; // N
  if (sameFamily(cellGx + 1, cellGz)) mask |= 0b0100; // E
  if (sameFamily(cellGx, cellGz + 1)) mask |= 0b0010; // S
  if (sameFamily(cellGx - 1, cellGz)) mask |= 0b0001; // W
  return mask;
}

/**
 * Resolve a variant from a bitmask + family. Bitmasks outside 0..15
 * are clamped (defensive — caller bugs surface here rather than in
 * an array-out-of-bounds crash). Returns the picked variant + the
 * (clamped) index actually used so the resolver can persist both on
 * the WangTile component.
 */
export function resolveVariantIndex(
  bitmask: number,
  family: WangTileFamily
): { variant: WangTileVariant; index: number } {
  const clamped = clampBitmask(bitmask);
  return { variant: family.variants[clamped]!, index: clamped };
}

function clampBitmask(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 15) return 15;
  // Force integer in case caller passed a fractional number.
  return value | 0;
}
