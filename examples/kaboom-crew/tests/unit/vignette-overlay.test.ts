// S217 KABOOM-VIGNETTE-OVERLAY (GDP-2026-05-29-002 part 3 — WebGPU
// path). Pure-helper tests for the radial-gradient CSS builder.
// Mount-side behaviour is exercised in the live Playwright probe;
// the unit tests lock the gradient shape + URL parsing.

import { describe, expect, it } from "vitest";

import {
  buildVignetteBackground,
  readVignetteOptionsFromUrl
} from "../../src/ui/vignette-overlay";

describe("kaboom vignette overlay (S217)", () => {
  it("default gradient: ~60 % inner-stop + ~40 % corner alpha", () => {
    const bg = buildVignetteBackground();
    // (1 - 0.45) * 100 = 55.0 %
    expect(bg).toContain("55.0%");
    expect(bg).toContain("0.400)");
    expect(bg).toContain("rgba(0,0,0,0) 0%");
    expect(bg).toContain("100%");
  });

  it("intensity=1 puts a fully opaque corner; intensity=0 keeps it transparent", () => {
    expect(buildVignetteBackground({ intensity: 1 })).toContain("1.000)");
    expect(buildVignetteBackground({ intensity: 0 })).toContain("0.000)");
  });

  it("falloff=0 keeps the band at the very corner (inner-stop = 100 %)", () => {
    expect(buildVignetteBackground({ falloff: 0 })).toContain("100.0%");
  });

  it("falloff=1 covers the whole frame (inner-stop = 0 %)", () => {
    expect(buildVignetteBackground({ falloff: 1 })).toContain("0.0%");
  });

  it("non-finite values clamp to 0", () => {
    expect(buildVignetteBackground({ intensity: Number.NaN, falloff: Number.NaN })).toContain("0.000)");
  });

  it("out-of-range values clamp to [0, 1]", () => {
    expect(buildVignetteBackground({ intensity: -1 })).toContain("0.000)");
    expect(buildVignetteBackground({ intensity: 2 })).toContain("1.000)");
  });

  function withLocation(search: string, fn: () => void): void {
    const target = globalThis as unknown as { location?: { search?: string } };
    const prev = target.location;
    target.location = { search };
    try {
      fn();
    } finally {
      if (prev === undefined) delete target.location;
      else target.location = prev;
    }
  }

  it("readVignetteOptionsFromUrl: empty search → defaults", () => {
    withLocation("", () => {
      expect(readVignetteOptionsFromUrl()).toEqual({});
    });
  });

  it("readVignetteOptionsFromUrl: ?vignette=off → undefined (skip mount)", () => {
    withLocation("?vignette=off", () => {
      expect(readVignetteOptionsFromUrl()).toBeUndefined();
    });
  });

  it("readVignetteOptionsFromUrl: parses intensity + falloff overrides", () => {
    withLocation("?vignetteIntensity=0.6&vignetteFalloff=0.3", () => {
      expect(readVignetteOptionsFromUrl()).toEqual({ intensity: 0.6, falloff: 0.3 });
    });
  });
});
