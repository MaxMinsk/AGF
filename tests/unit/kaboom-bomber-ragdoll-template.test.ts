// S129 — verify the kaboom-bomber ragdoll template matches the
// docs/game-design/ragdoll-module-design.md §9 spec + registers
// cleanly against the engine registry.

import { afterEach, describe, expect, it } from "vitest";

import {
  KABOOM_BOMBER_RAGDOLL,
  KABOOM_BOMBER_RAGDOLL_KEY
} from "../../examples/kaboom-crew/src/characters/kaboom-bomber-ragdoll-template";
import {
  clearRagdollTemplates,
  getRagdollTemplate,
  listRagdollTemplates,
  registerRagdollTemplate
} from "../../engine/physics/ragdoll/template-registry";

describe("kaboom-bomber ragdoll template (S129)", () => {
  afterEach(() => clearRagdollTemplates());

  it("template has exactly 10 bodies + 9 joints (per design doc §9)", () => {
    expect(KABOOM_BOMBER_RAGDOLL.bodies.length).toBe(10);
    expect(KABOOM_BOMBER_RAGDOLL.joints?.length ?? 0).toBe(9);
  });

  it("total mass is approximately 1.0 (mass-balanced)", () => {
    const total = KABOOM_BOMBER_RAGDOLL.bodies.reduce((sum, b) => sum + (b.mass ?? 0), 0);
    expect(total).toBeGreaterThan(0.95);
    expect(total).toBeLessThan(1.05);
  });

  it("body names match the procedural character generator's 10 visible meshes", () => {
    const names = new Set(KABOOM_BOMBER_RAGDOLL.bodies.map((b) => b.name));
    const expected = new Set([
      "torso",
      "head",
      "upperArm.l",
      "forearm.l",
      "upperArm.r",
      "forearm.r",
      "upperLeg.l",
      "lowerLeg.l",
      "upperLeg.r",
      "lowerLeg.r"
    ]);
    expect(names).toEqual(expected);
  });

  it("joints reference only declared bodies — no orphaned references", () => {
    const bodyNames = new Set(KABOOM_BOMBER_RAGDOLL.bodies.map((b) => b.name));
    for (const joint of KABOOM_BOMBER_RAGDOLL.joints ?? []) {
      expect(bodyNames.has(joint.bodyA)).toBe(true);
      expect(bodyNames.has(joint.bodyB)).toBe(true);
    }
  });

  it("registers cleanly against the engine registry", () => {
    expect(() => registerRagdollTemplate(KABOOM_BOMBER_RAGDOLL_KEY, KABOOM_BOMBER_RAGDOLL)).not.toThrow();
    expect(listRagdollTemplates()).toContain(KABOOM_BOMBER_RAGDOLL_KEY);
    expect(getRagdollTemplate(KABOOM_BOMBER_RAGDOLL_KEY)).toBe(KABOOM_BOMBER_RAGDOLL);
  });

  it("4 ball joints + 4 revolute joints + 1 ball neck (per design doc)", () => {
    const counts: Record<string, number> = { ball: 0, revolute: 0, fixed: 0 };
    for (const joint of KABOOM_BOMBER_RAGDOLL.joints ?? []) {
      counts[joint.type] = (counts[joint.type] ?? 0) + 1;
    }
    // neck + 2 shoulders + 2 hips = 5 ball; 2 elbows + 2 knees = 4 revolute
    expect(counts["ball"]).toBe(5);
    expect(counts["revolute"]).toBe(4);
    expect(counts["fixed"]).toBe(0);
  });
});
