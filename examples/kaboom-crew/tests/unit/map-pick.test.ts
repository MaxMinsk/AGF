// S140 — random-map session picker tests. Mirrors the S139
// personality picker contract: URL override wins, otherwise a random
// pick from the registry keys memoised once per page load.

import { afterEach, describe, expect, it } from "vitest";

import { _resetSessionMap, resolveSessionMap } from "../../src/map-pick";

function registryWith(...keys: string[]): ReadonlyMap<string, unknown> {
  const m = new Map<string, unknown>();
  for (const k of keys) m.set(k, {});
  return m;
}

describe("resolveSessionMap (S140)", () => {
  afterEach(() => _resetSessionMap());

  it("URL override beats the random pick when the value is in the registry", () => {
    const reg = registryWith("start", "wide", "corridor");
    expect(resolveSessionMap("?map=start", reg, () => 0.99)).toBe("start");
    expect(resolveSessionMap("?map=wide", reg, () => 0)).toBe("wide");
    expect(resolveSessionMap("?map=corridor", reg, () => 0.5)).toBe("corridor");
  });

  it("empty / undefined URL triggers the random path", () => {
    const reg = registryWith("start", "wide", "corridor");
    expect(resolveSessionMap(undefined, reg, () => 0)).toBe("start");
    _resetSessionMap();
    expect(resolveSessionMap("", reg, () => 0.5)).toBe("wide");
    _resetSessionMap();
    expect(resolveSessionMap("?other=1", reg, () => 0.99)).toBe("corridor");
  });

  it("URL with unknown map slug falls back to random", () => {
    const reg = registryWith("start", "wide", "corridor");
    expect(resolveSessionMap("?map=garbage", reg, () => 0)).toBe("start");
    _resetSessionMap();
    expect(resolveSessionMap("?map=zone-zero", reg, () => 0.67)).toBe("corridor");
  });

  it("random pick is uniform over all registry keys", () => {
    const reg = registryWith("start", "wide", "corridor");
    expect(resolveSessionMap(undefined, reg, () => 0.0)).toBe("start");
    _resetSessionMap();
    expect(resolveSessionMap(undefined, reg, () => 0.34)).toBe("wide");
    _resetSessionMap();
    expect(resolveSessionMap(undefined, reg, () => 0.67)).toBe("corridor");
    _resetSessionMap();
    // 0.999... still lands within the last bucket (mod-len safety).
    expect(resolveSessionMap(undefined, reg, () => 0.9999)).toBe("corridor");
  });

  it("memoises the random pick across calls without URL", () => {
    const reg = registryWith("start", "wide", "corridor");
    let calls = 0;
    const rng = (): number => {
      calls += 1;
      return calls === 1 ? 0.0 : 0.9; // first call → start; subsequent would be corridor
    };
    expect(resolveSessionMap(undefined, reg, rng)).toBe("start");
    expect(resolveSessionMap(undefined, reg, rng)).toBe("start");
    expect(resolveSessionMap(undefined, reg, rng)).toBe("start");
    expect(calls).toBe(1);
  });

  it("URL override does NOT pollute the random session — subsequent no-URL calls still memoise the random", () => {
    const reg = registryWith("start", "wide", "corridor");
    // URL pick first — returns the URL value, does NOT touch the cache.
    expect(resolveSessionMap("?map=corridor", reg, () => 0)).toBe("corridor");
    // Next no-URL call still hits the random path + memoises.
    expect(resolveSessionMap(undefined, reg, () => 0.5)).toBe("wide");
    // Subsequent no-URL call must reuse the cached random — even if rng
    // would now produce a different value.
    expect(resolveSessionMap(undefined, reg, () => 0.99)).toBe("wide");
  });

  it("defensive: an empty registry returns 'start' (no infinite loop / NaN)", () => {
    const reg = registryWith();
    expect(resolveSessionMap(undefined, reg, () => 0)).toBe("start");
  });
});
