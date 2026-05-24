// S126 KABOOM-RAGDOLL-MODULE foundation — template registry tests.

import { afterEach, describe, expect, it } from "vitest";

import {
  clearRagdollTemplates,
  getRagdollTemplate,
  listRagdollTemplates,
  registerRagdollTemplate,
  type RagdollTemplate
} from "../../engine/physics/ragdoll/template-registry";

const minimal: RagdollTemplate = {
  bodies: [{ name: "torso", shape: "box", dimensions: [0.5, 0.8, 0.3] }]
};

describe("RagdollTemplate registry (S126)", () => {
  afterEach(() => {
    clearRagdollTemplates();
  });

  it("registerRagdollTemplate + getRagdollTemplate round-trip a valid template", () => {
    registerRagdollTemplate("test-1", minimal);
    expect(getRagdollTemplate("test-1")).toEqual(minimal);
  });

  it("getRagdollTemplate returns undefined for unknown keys", () => {
    expect(getRagdollTemplate("nope")).toBeUndefined();
  });

  it("listRagdollTemplates returns the registered keys, sorted", () => {
    registerRagdollTemplate("c-template", minimal);
    registerRagdollTemplate("a-template", minimal);
    registerRagdollTemplate("b-template", minimal);
    expect(listRagdollTemplates()).toEqual(["a-template", "b-template", "c-template"]);
  });

  it("duplicate key throws with a helpful error", () => {
    registerRagdollTemplate("dup", minimal);
    expect(() => registerRagdollTemplate("dup", minimal)).toThrow(/duplicate key "dup"/);
  });

  it("empty key throws fast", () => {
    expect(() => registerRagdollTemplate("", minimal)).toThrow(/non-empty string/);
  });

  it("clearRagdollTemplates wipes the registry", () => {
    registerRagdollTemplate("x", minimal);
    expect(listRagdollTemplates()).toEqual(["x"]);
    clearRagdollTemplates();
    expect(listRagdollTemplates()).toEqual([]);
  });

  it("validates template body shape — bad shape throws with path", () => {
    expect(() =>
      registerRagdollTemplate("bad-shape", {
        bodies: [{ name: "torso", shape: "mesh" as unknown as "box", dimensions: [1, 1, 1] }]
      })
    ).toThrow(/shape/);
  });

  it("validates dimensions arity — 2-element array rejected", () => {
    expect(() =>
      registerRagdollTemplate("bad-dims", {
        bodies: [
          {
            name: "torso",
            shape: "box",
            dimensions: [1, 1] as unknown as [number, number, number]
          }
        ]
      })
    ).toThrow();
  });

  it("validates required fields — empty bodies array rejected", () => {
    expect(() => registerRagdollTemplate("empty", { bodies: [] })).toThrow();
  });

  it("accepts a multi-body template with joints", () => {
    const full: RagdollTemplate = {
      bodies: [
        { name: "torso", shape: "box", dimensions: [0.5, 0.8, 0.3] },
        { name: "head", shape: "sphere", dimensions: [0.2, 0, 0] }
      ],
      joints: [
        {
          name: "neck",
          bodyA: "torso",
          bodyB: "head",
          type: "ball",
          anchorA: [0, 0.4, 0],
          anchorB: [0, -0.2, 0]
        }
      ]
    };
    registerRagdollTemplate("with-joints", full);
    expect(getRagdollTemplate("with-joints")).toEqual(full);
  });

  it("validates joint type enum — bad type rejected", () => {
    expect(() =>
      registerRagdollTemplate("bad-joint", {
        bodies: [
          { name: "torso", shape: "box", dimensions: [1, 1, 1] },
          { name: "head", shape: "sphere", dimensions: [0.2, 0, 0] }
        ],
        joints: [
          {
            name: "neck",
            bodyA: "torso",
            bodyB: "head",
            type: "weld" as unknown as "ball"
          }
        ]
      })
    ).toThrow(/type/);
  });
});
