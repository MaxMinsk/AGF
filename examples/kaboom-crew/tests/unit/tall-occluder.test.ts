// S294 (GDP-2026-06-04-007) — tall-occluder predicate: only occluders whose
// mesh top is >= 2 cells qualify to cast the hidden-bomber silhouette.

import { describe, expect, it } from "vitest";

import { isTallOccluder, TALL_OCCLUDER_THRESHOLD } from "../../src/bootstrap-helpers";

describe("isTallOccluder (S294)", () => {
  it("threshold is 2.0 cells", () => {
    expect(TALL_OCCLUDER_THRESHOLD).toBe(2.0);
  });
  it("pillar h=1 (top ~1) does NOT qualify", () => {
    expect(isTallOccluder(1)).toBe(false);
  });
  it("pillar h=2 / h=3 (top >=2) qualifies", () => {
    expect(isTallOccluder(2)).toBe(true);
    expect(isTallOccluder(3)).toBe(true);
  });
  it("block on flat cell (top ~1 = lift0+1) does NOT qualify", () => {
    expect(isTallOccluder(0 + 1)).toBe(false);
  });
  it("block on h=1 cell (top ~2 = lift1+1) qualifies", () => {
    expect(isTallOccluder(1 + 1)).toBe(true);
  });
  it("boundary: exactly 2.0 qualifies (inclusive); 1.99 does not", () => {
    expect(isTallOccluder(2.0)).toBe(true);
    expect(isTallOccluder(1.99)).toBe(false);
  });
});
