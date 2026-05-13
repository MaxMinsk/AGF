// Deterministic pseudo-random generator.
//
// Used by systems that today rely on `Math.random()` (none in Beacon World as
// of Sprint 29; this primitive exists so the first system that *does* roll
// dice can inject a seeded source instead of touching the global). Pair with
// `engine replay` for deterministic regression bisection.
//
// Implementation: mulberry32 — a tiny but high-quality 32-bit PRNG. Equal
// distribution and period ~2^32. Suitable for gameplay variance; not for
// crypto.

export type SeededRng = {
  /** Returns a float in `[0, 1)`. */
  next(): number;
  /** Returns a float in `[min, max)`. Throws if `max <= min`. */
  nextRange(min: number, max: number): number;
  /** Returns an integer in `[min, max)` (max exclusive). */
  nextInt(min: number, max: number): number;
  /** Returns one entry from a non-empty array. */
  pick<T>(values: ReadonlyArray<T>): T;
  /** Current 32-bit internal state — exposed so callers can persist + restore. */
  state(): number;
};

export function createSeededRng(seed: number): SeededRng {
  let state = (seed | 0) >>> 0;
  if (state === 0) {
    // mulberry32 with state 0 always returns 0; bump it so callers don't get
    // a degenerate sequence when they pass `0` (very common as a default).
    state = 0x9e3779b9;
  }

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    nextRange(min, max): number {
      if (!(max > min)) {
        throw new Error(`nextRange: max (${max}) must be greater than min (${min}).`);
      }
      return min + next() * (max - min);
    },
    nextInt(min, max): number {
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        throw new Error(`nextInt: min/max must be integers (got ${min}, ${max}).`);
      }
      if (!(max > min)) {
        throw new Error(`nextInt: max (${max}) must be greater than min (${min}).`);
      }
      return Math.floor(min + next() * (max - min));
    },
    pick<T>(values: ReadonlyArray<T>): T {
      if (values.length === 0) {
        throw new Error("pick: cannot select from an empty array.");
      }
      const value = values[Math.floor(next() * values.length)];
      // The index above is in range, so a non-undefined T is guaranteed.
      return value as T;
    },
    state(): number {
      return state >>> 0;
    }
  };
}
