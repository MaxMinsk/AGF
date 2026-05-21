// S106 KABOOM-ACCESSORY-MOUNT-SOCKETS.

import { describe, expect, it } from "vitest";

import { BOMBER_MESH_DEFAULTS } from "../../src/generators/bomber-mesh";
import {
  MOUNT_SOCKET_NAMES,
  computeMountSockets,
  isMountSocketName
} from "../../src/accessories/mount-sockets";

const SIZES = {
  headSize: BOMBER_MESH_DEFAULTS.headSize,
  torsoHeight: BOMBER_MESH_DEFAULTS.torsoHeight,
  torsoWidth: BOMBER_MESH_DEFAULTS.torsoWidth,
  upperArmLength: BOMBER_MESH_DEFAULTS.upperArmLength,
  forearmLength: BOMBER_MESH_DEFAULTS.forearmLength,
  armWidth: BOMBER_MESH_DEFAULTS.armWidth,
  upperLegLength: BOMBER_MESH_DEFAULTS.upperLegLength,
  lowerLegLength: BOMBER_MESH_DEFAULTS.lowerLegLength,
  legWidth: BOMBER_MESH_DEFAULTS.legWidth
};

describe("MOUNT_SOCKET_NAMES (S106)", () => {
  it("ships exactly 5 named sockets", () => {
    expect(MOUNT_SOCKET_NAMES.length).toBe(5);
  });
  it("isMountSocketName recognises each shipped name", () => {
    for (const n of MOUNT_SOCKET_NAMES) expect(isMountSocketName(n)).toBe(true);
  });
  it("rejects unknown names", () => {
    expect(isMountSocketName("head.unknown")).toBe(false);
    expect(isMountSocketName("")).toBe(false);
    expect(isMountSocketName(undefined)).toBe(false);
  });
});

describe("computeMountSockets (S106)", () => {
  it("head.crown sits on top of the head (positive Y matches headSize/2)", () => {
    const s = computeMountSockets(SIZES);
    expect(s["head.crown"].parentSuffix).toBe("head");
    expect(s["head.crown"].position[1]).toBeCloseTo(SIZES.headSize / 2, 5);
    expect(s["head.crown"].position[0]).toBe(0);
    expect(s["head.crown"].position[2]).toBe(0);
  });

  it("head.eyes sits on the front face (positive Z)", () => {
    const s = computeMountSockets(SIZES);
    expect(s["head.eyes"].parentSuffix).toBe("head");
    expect(s["head.eyes"].position[2]).toBeCloseTo(SIZES.headSize / 2, 5);
  });

  it("torso.back is on the back face (negative Z)", () => {
    const s = computeMountSockets(SIZES);
    expect(s["torso.back"].parentSuffix).toBe("torso");
    expect(s["torso.back"].position[2]).toBeLessThan(0);
  });

  it("torso.sideL and torso.sideR are mirrored on X", () => {
    const s = computeMountSockets(SIZES);
    expect(s["torso.sideL"].position[0]).toBeLessThan(0);
    expect(s["torso.sideR"].position[0]).toBeGreaterThan(0);
    expect(s["torso.sideL"].position[0]).toBeCloseTo(-s["torso.sideR"].position[0], 5);
  });

  it("scales with the bomber's sizes", () => {
    const big = computeMountSockets({ ...SIZES, headSize: 0.6, torsoWidth: 0.7 });
    expect(big["head.crown"].position[1]).toBe(0.3);
    expect(big["torso.sideR"].position[0]).toBe(0.35);
  });
});
