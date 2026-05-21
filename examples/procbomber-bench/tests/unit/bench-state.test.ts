// S101 PROCBOMBER-BENCH-UI-CONTROLS — bench state shape + builder.

import { describe, expect, it } from "vitest";

import {
  BOMBER_MESH_DEFAULTS
} from "../../src/generators/bomber-mesh";
import {
  buildBomberGeometry,
  defaultBenchState,
  resolvePalette,
  PALETTE_OPTIONS
} from "../../src/bench-state";

describe("defaultBenchState (S101)", () => {
  it("initializes every size knob from BOMBER_MESH_DEFAULTS", () => {
    const s = defaultBenchState();
    expect(s.headSize).toBe(BOMBER_MESH_DEFAULTS.headSize);
    expect(s.torsoHeight).toBe(BOMBER_MESH_DEFAULTS.torsoHeight);
    expect(s.legLength).toBe(BOMBER_MESH_DEFAULTS.legLength);
    expect(s.armLength).toBe(BOMBER_MESH_DEFAULTS.armLength);
    expect(s.paletteOverride).toBeUndefined();
    expect(s.seed).toBe("default");
  });

  it("honours the initialPalette argument", () => {
    const s = defaultBenchState("ember");
    expect(s.paletteOverride).toBe("ember");
  });
});

describe("resolvePalette (S101)", () => {
  it("returns the override palette when set", () => {
    const s = defaultBenchState("mint");
    expect(resolvePalette(s).name).toBe("mint");
  });
  it("falls back to the seed picker when override is undefined", () => {
    const s = defaultBenchState();
    s.seed = "seed-1";
    expect(PALETTE_OPTIONS).toContain(resolvePalette(s).name);
  });
});

describe("buildBomberGeometry (S101)", () => {
  it("returns a BufferGeometry whose vertex count matches the six-box humanoid", () => {
    const s = defaultBenchState();
    const g = buildBomberGeometry(s);
    expect(g.getAttribute("position")!.count).toBe(144);
  });

  it("varies the geometry when a slider knob changes", () => {
    const s1 = defaultBenchState();
    const g1 = buildBomberGeometry(s1);
    const s2 = defaultBenchState();
    s2.headSize = 0.6;
    const g2 = buildBomberGeometry(s2);
    expect((g1.userData["totalHeight"] as number)).not.toBe(g2.userData["totalHeight"]);
  });
});

describe("PALETTE_OPTIONS (S101)", () => {
  it("exposes all 8 named palettes for the dropdown", () => {
    expect(PALETTE_OPTIONS.length).toBe(8);
    expect(PALETTE_OPTIONS).toContain("sky");
    expect(PALETTE_OPTIONS).toContain("slate");
  });
});
