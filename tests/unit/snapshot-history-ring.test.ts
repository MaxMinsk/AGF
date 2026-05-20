// S095 AGF-PROBE-SNAPSHOT-HISTORY — pure ring-lookup tests.

import { describe, expect, it } from "vitest";

import { lookupSnapshotInRing } from "../../engine/runtime/start";

describe("lookupSnapshotInRing (S095 AGF-PROBE-SNAPSHOT-HISTORY)", () => {
  it("returns undefined for at=0 (caller must fall back to live snapshot)", () => {
    const ring = ["a", "b", "c"];
    expect(lookupSnapshotInRing(ring, 0)).toBeUndefined();
  });

  it("at=-1 returns the most-recent ring entry; at=-N returns N steps back", () => {
    const ring = ["t0", "t1", "t2", "t3", "t4"]; // t4 is most recent
    expect(lookupSnapshotInRing(ring, -1)).toBe("t4");
    expect(lookupSnapshotInRing(ring, -2)).toBe("t3");
    expect(lookupSnapshotInRing(ring, -3)).toBe("t2");
    expect(lookupSnapshotInRing(ring, -5)).toBe("t0");
  });

  it("returns undefined when |-at| exceeds the ring length", () => {
    const ring = ["a", "b", "c"];
    expect(lookupSnapshotInRing(ring, -4)).toBeUndefined();
    expect(lookupSnapshotInRing(ring, -99)).toBeUndefined();
  });

  it("returns undefined for an empty ring at any negative index", () => {
    expect(lookupSnapshotInRing([], -1)).toBeUndefined();
    expect(lookupSnapshotInRing([], -5)).toBeUndefined();
  });

  it("non-finite at returns undefined (defensive)", () => {
    const ring = ["a", "b"];
    expect(lookupSnapshotInRing(ring, Number.NaN)).toBeUndefined();
    expect(lookupSnapshotInRing(ring, Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(lookupSnapshotInRing(ring, Number.NEGATIVE_INFINITY)).toBeUndefined();
  });

  it("positive at returns undefined (caller should fall back to live snapshot)", () => {
    const ring = ["a", "b", "c"];
    expect(lookupSnapshotInRing(ring, 1)).toBeUndefined();
    expect(lookupSnapshotInRing(ring, 5)).toBeUndefined();
  });

  it("non-integer at floors toward more-negative (consistent with Math.floor(-at))", () => {
    const ring = ["t0", "t1", "t2", "t3"];
    // at=-1.6 → back = floor(1.6) = 1 → most recent.
    expect(lookupSnapshotInRing(ring, -1.6)).toBe("t3");
    // at=-2.9 → back = floor(2.9) = 2.
    expect(lookupSnapshotInRing(ring, -2.9)).toBe("t2");
  });
});
