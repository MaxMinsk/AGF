// S205 — rotatedMapForMatch is a pure helper that picks the active
// arena for a given match number. The full bootstrap wiring (URL
// lock, restartScene call site) is exercised manually + by the live
// game; this file just locks the index math.

import { describe, expect, it } from "vitest";

import { rotatedMapForMatch } from "../../bootstrap";

const POOL: ReadonlyArray<string> = [
  "start",
  "wide",
  "corridor",
  "plaza",
  "cross",
  "pit",
  "belt-zone",
  "warpfield",
  "plate-puzzle"
];

describe("S205 rotatedMapForMatch", () => {
  it("match 1 returns the first map in the pool", () => {
    expect(rotatedMapForMatch(1, POOL as never)).toBe("start");
  });

  it("match 2 returns the second map", () => {
    expect(rotatedMapForMatch(2, POOL as never)).toBe("wide");
  });

  it("match 9 returns the last map (pool length)", () => {
    expect(rotatedMapForMatch(9, POOL as never)).toBe("plate-puzzle");
  });

  it("match 10 wraps around to the first map again", () => {
    expect(rotatedMapForMatch(10, POOL as never)).toBe("start");
  });

  it("non-positive match numbers wrap (defensive)", () => {
    expect(rotatedMapForMatch(0, POOL as never)).toBe("plate-puzzle");
    expect(rotatedMapForMatch(-1, POOL as never)).toBe("warpfield");
  });

  it("empty pool falls back to 'start' (defensive)", () => {
    expect(rotatedMapForMatch(1, [] as never)).toBe("start");
  });

  it("default pool (no second arg) returns SOME registered map for matches 1..20", () => {
    const seen = new Set<string>();
    for (let m = 1; m <= 20; m += 1) {
      seen.add(rotatedMapForMatch(m));
    }
    // After 20 matches we've cycled the default pool ≥2 times.
    expect(seen.size).toBeGreaterThanOrEqual(9);
  });
});
