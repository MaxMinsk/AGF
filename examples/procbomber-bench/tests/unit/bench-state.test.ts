// S101 PROCBOMBER-BENCH-UI-CONTROLS — bench state shape + builder.

import { describe, expect, it } from "vitest";

import {
  BOMBER_MESH_DEFAULTS
} from "../../src/generators/bomber-mesh";
import {
  BOMBER_SHAPE_OPTIONS,
  PALETTE_OPTIONS,
  buildBomberGeometry,
  defaultBenchState,
  isBomberShape,
  mountsOf,
  postureOf,
  resolvePalette,
  shapesOf,
  sizesOf
} from "../../src/bench-state";

describe("defaultBenchState (S101)", () => {
  it("initializes every size knob from BOMBER_MESH_DEFAULTS", () => {
    const s = defaultBenchState();
    expect(s.headSize).toBe(BOMBER_MESH_DEFAULTS.headSize);
    expect(s.torsoHeight).toBe(BOMBER_MESH_DEFAULTS.torsoHeight);
    expect(s.upperLegLength).toBe(BOMBER_MESH_DEFAULTS.upperLegLength);
    expect(s.lowerLegLength).toBe(BOMBER_MESH_DEFAULTS.lowerLegLength);
    expect(s.upperArmLength).toBe(BOMBER_MESH_DEFAULTS.upperArmLength);
    expect(s.forearmLength).toBe(BOMBER_MESH_DEFAULTS.forearmLength);
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

describe("BenchState recipe params (S102 PROCBOMBER-RECIPE-PARAMS-16)", () => {
  it("defaultBenchState initialises all 16 recipe parameters", () => {
    const s = defaultBenchState();
    // 7 size knobs from S101.
    expect(s.headSize).toBe(0.35);
    // 2 posture knobs.
    expect(s.forwardTilt).toBe(0);
    expect(s.armRestAngle).toBe(0);
    // 4 mount offsets.
    expect(s.shoulderMountY).toBe(0);
    expect(s.shoulderMountZ).toBe(0);
    expect(s.hipMountY).toBe(0);
    expect(s.hipMountZ).toBe(0);
    // 3 shape knobs default to "box".
    expect(s.headShape).toBe("box");
    expect(s.torsoShape).toBe("box");
    expect(s.limbShape).toBe("box");
  });

  it("sizesOf + postureOf + mountsOf + shapesOf slice the state correctly", () => {
    const s = defaultBenchState();
    s.headSize = 0.42;
    s.forwardTilt = 0.3;
    s.armRestAngle = -0.1;
    s.shoulderMountY = 0.05;
    s.hipMountZ = -0.04;
    s.torsoShape = "cylinder";
    s.limbShape = "capsule";

    expect(sizesOf(s).headSize).toBe(0.42);
    expect(postureOf(s)).toEqual({ forwardTilt: 0.3, armRestAngle: -0.1 });
    expect(mountsOf(s)).toEqual({
      shoulderMountY: 0.05,
      shoulderMountZ: 0,
      hipMountY: 0,
      hipMountZ: -0.04
    });
    expect(shapesOf(s)).toEqual({ head: "box", torso: "cylinder", limb: "capsule" });
  });

  it("BOMBER_SHAPE_OPTIONS lists 3 entries", () => {
    expect([...BOMBER_SHAPE_OPTIONS].sort()).toEqual(["box", "capsule", "cylinder"]);
  });

  it("isBomberShape accepts shipped names + rejects others", () => {
    expect(isBomberShape("box")).toBe(true);
    expect(isBomberShape("capsule")).toBe(true);
    expect(isBomberShape("cylinder")).toBe(true);
    expect(isBomberShape("sphere")).toBe(false);
    expect(isBomberShape("")).toBe(false);
  });
});
