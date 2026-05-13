import { describe, expect, it } from "vitest";
import { createSeededRng } from "../../engine/core/util/seeded-rng";

describe("createSeededRng", () => {
  it("produces identical sequences for the same seed", () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const aSeq = [a.next(), a.next(), a.next(), a.next()];
    const bSeq = [b.next(), b.next(), b.next(), b.next()];
    expect(aSeq).toEqual(bSeq);
  });

  it("produces different sequences for different seeds", () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("nextRange stays inside [min, max)", () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 200; i += 1) {
      const value = rng.nextRange(-5, 10);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThan(10);
    }
  });

  it("nextInt returns integers in [min, max)", () => {
    const rng = createSeededRng(11);
    for (let i = 0; i < 200; i += 1) {
      const value = rng.nextInt(0, 5);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(5);
    }
  });

  it("pick is uniform enough across many draws", () => {
    const rng = createSeededRng(99);
    const values = ["a", "b", "c", "d"];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
    for (let i = 0; i < 4000; i += 1) {
      const key = rng.pick(values);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    // Each bucket should hover around 1000 ± wide tolerance. The point is to
    // catch a degenerate impl (e.g. always returning index 0), not to gate
    // mulberry32's statistical quality.
    for (const v of values) {
      expect(counts[v] ?? 0).toBeGreaterThan(700);
      expect(counts[v] ?? 0).toBeLessThan(1300);
    }
  });

  it("handles seed=0 by bumping to a non-degenerate state", () => {
    const rng = createSeededRng(0);
    const first = rng.next();
    const second = rng.next();
    expect(first).not.toBe(0);
    expect(first).not.toBe(second);
  });

  it("rejects nonsensical ranges", () => {
    const rng = createSeededRng(1);
    expect(() => rng.nextRange(5, 5)).toThrow();
    expect(() => rng.nextInt(0, 0)).toThrow();
    expect(() => rng.nextInt(1.5, 5)).toThrow();
    expect(() => rng.pick([])).toThrow();
  });
});
