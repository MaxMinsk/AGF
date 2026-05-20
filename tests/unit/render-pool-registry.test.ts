// S53 RENDER-pool-registry — shared-bookkeeping helper contract.
//
// Locks the surface used by the adapter's three pool callers
// (acquireBucket / acquireBatchedBucket / acquireParticlePool) so a
// future refactor doesn't accidentally regress the monotonic-handle
// guarantee, the release-returns-entry contract, or iteration order.

import { describe, expect, it } from "vitest";

import { RenderPoolRegistry } from "../../engine/render/render-pool-registry";

describe("RenderPoolRegistry (S53)", () => {
  it("hands out monotonic handles starting at 1", () => {
    const reg = new RenderPoolRegistry<string>();
    expect(reg.acquire("alpha")).toBe(1);
    expect(reg.acquire("beta")).toBe(2);
    expect(reg.acquire("gamma")).toBe(3);
  });

  it("get(handle) returns the entry; missing handles return undefined", () => {
    const reg = new RenderPoolRegistry<{ id: string }>();
    const h = reg.acquire({ id: "alpha" });
    expect(reg.get(h)).toEqual({ id: "alpha" });
    expect(reg.get(999)).toBeUndefined();
  });

  it("release(handle) returns the dropped entry + removes it from the registry", () => {
    const reg = new RenderPoolRegistry<{ id: string }>();
    const h = reg.acquire({ id: "alpha" });
    const dropped = reg.release(h);
    expect(dropped).toEqual({ id: "alpha" });
    expect(reg.has(h)).toBe(false);
    expect(reg.size()).toBe(0);
  });

  it("release(handle) on an unknown handle returns undefined and is a no-op", () => {
    const reg = new RenderPoolRegistry<string>();
    reg.acquire("alpha");
    expect(reg.release(999)).toBeUndefined();
    expect(reg.size()).toBe(1);
  });

  it("handles stay unique after a release — no reuse (avoids stale-handle bugs)", () => {
    const reg = new RenderPoolRegistry<string>();
    const a = reg.acquire("alpha");
    reg.release(a);
    const b = reg.acquire("beta");
    expect(b).not.toBe(a);
    expect(b).toBeGreaterThan(a);
  });

  it("entriesIter yields [handle, entry] pairs in insertion order", () => {
    const reg = new RenderPoolRegistry<string>();
    const a = reg.acquire("alpha");
    const b = reg.acquire("beta");
    const c = reg.acquire("gamma");
    const seen = [...reg.entriesIter()];
    expect(seen).toEqual([[a, "alpha"], [b, "beta"], [c, "gamma"]]);
  });

  it("values() iterates current entries", () => {
    const reg = new RenderPoolRegistry<string>();
    reg.acquire("alpha");
    reg.acquire("beta");
    expect([...reg.values()]).toEqual(["alpha", "beta"]);
  });

  it("drain yields every entry then empties the registry", () => {
    const reg = new RenderPoolRegistry<string>();
    reg.acquire("alpha");
    reg.acquire("beta");
    const drained = [...reg.drain()];
    expect(drained).toEqual(["alpha", "beta"]);
    expect(reg.size()).toBe(0);
  });

  describe("S88 AGF-POOL-INVENTORY-API peak tracking", () => {
    it("peak() bumps as live size grows", () => {
      const reg = new RenderPoolRegistry<string>();
      expect(reg.peak()).toBe(0);
      reg.acquire("alpha");
      expect(reg.peak()).toBe(1);
      reg.acquire("beta");
      reg.acquire("gamma");
      expect(reg.peak()).toBe(3);
    });

    it("peak() does NOT decrease on release — retains the high-water mark", () => {
      const reg = new RenderPoolRegistry<string>();
      const a = reg.acquire("alpha");
      const b = reg.acquire("beta");
      expect(reg.peak()).toBe(2);
      reg.release(a);
      reg.release(b);
      expect(reg.size()).toBe(0);
      expect(reg.peak()).toBe(2);
    });

    it("reset() drops both the handle counter and the peak", () => {
      const reg = new RenderPoolRegistry<string>();
      const a = reg.acquire("alpha");
      reg.release(a);
      expect(reg.peak()).toBe(1);
      reg.reset();
      expect(reg.peak()).toBe(0);
      // After reset, the next acquire restarts the monotonic counter at 1.
      expect(reg.acquire("beta")).toBe(1);
    });

    it("drain does NOT touch the peak — that's only reset()'s job", () => {
      const reg = new RenderPoolRegistry<string>();
      reg.acquire("alpha");
      reg.acquire("beta");
      [...reg.drain()];
      expect(reg.size()).toBe(0);
      expect(reg.peak()).toBe(2);
    });
  });
});
