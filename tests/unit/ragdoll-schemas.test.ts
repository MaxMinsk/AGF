// S126 KABOOM-RAGDOLL-MODULE foundation — schema validation tests.
// Verifies that schemas/components/ragdoll.schema.json accepts the
// shapes documented in docs/game-design/ragdoll-module-design.md §3
// and rejects malformed inputs.

import Ajv, { type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schema = JSON.parse(
  readFileSync(resolve(repoRoot, "schemas/components/ragdoll.schema.json"), "utf8")
) as { definitions: Record<string, object> };

const ajv = new Ajv({ allErrors: true, strict: false });

function compile(defName: string): ValidateFunction {
  return ajv.compile({
    $ref: `#/definitions/${defName}`,
    definitions: schema.definitions
  });
}

const validateTemplate = compile("ragdollTemplate");
const validateBody = compile("ragdollBodyDef");
const validateJoint = compile("ragdollJointDef");
const validateSpawnRequest = compile("ragdollSpawnRequest");
const validateState = compile("ragdollState");

describe("ragdoll schemas (S126)", () => {
  it("minimal template (1 body, 0 joints) validates", () => {
    expect(
      validateTemplate({
        bodies: [{ name: "torso", shape: "box", dimensions: [0.5, 0.8, 0.3] }]
      })
    ).toBe(true);
  });

  it("humanoid template (10 bodies, 9 joints) validates", () => {
    const humanoid = {
      bodies: [
        { name: "torso", shape: "box", dimensions: [0.5, 0.8, 0.3] },
        { name: "head", shape: "sphere", dimensions: [0.2, 0, 0] },
        { name: "upperArm.l", shape: "capsule", dimensions: [0.08, 0.2, 0] },
        { name: "upperArm.r", shape: "capsule", dimensions: [0.08, 0.2, 0] },
        { name: "forearm.l", shape: "capsule", dimensions: [0.07, 0.2, 0] },
        { name: "forearm.r", shape: "capsule", dimensions: [0.07, 0.2, 0] },
        { name: "thigh.l", shape: "capsule", dimensions: [0.1, 0.25, 0] },
        { name: "thigh.r", shape: "capsule", dimensions: [0.1, 0.25, 0] },
        { name: "shin.l", shape: "capsule", dimensions: [0.09, 0.25, 0] },
        { name: "shin.r", shape: "capsule", dimensions: [0.09, 0.25, 0] }
      ],
      joints: [
        { name: "neck", bodyA: "torso", bodyB: "head", type: "ball" as const },
        { name: "shoulder.l", bodyA: "torso", bodyB: "upperArm.l", type: "ball" as const },
        { name: "shoulder.r", bodyA: "torso", bodyB: "upperArm.r", type: "ball" as const },
        { name: "elbow.l", bodyA: "upperArm.l", bodyB: "forearm.l", type: "revolute" as const, axis: [1, 0, 0] },
        { name: "elbow.r", bodyA: "upperArm.r", bodyB: "forearm.r", type: "revolute" as const, axis: [1, 0, 0] },
        { name: "hip.l", bodyA: "torso", bodyB: "thigh.l", type: "ball" as const },
        { name: "hip.r", bodyA: "torso", bodyB: "thigh.r", type: "ball" as const },
        { name: "knee.l", bodyA: "thigh.l", bodyB: "shin.l", type: "revolute" as const, axis: [1, 0, 0] },
        { name: "knee.r", bodyA: "thigh.r", bodyB: "shin.r", type: "revolute" as const, axis: [1, 0, 0] }
      ]
    };
    const ok = validateTemplate(humanoid);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.log("validateTemplate errors:", validateTemplate.errors);
    }
    expect(ok).toBe(true);
  });

  it("rejects template with missing bodies field", () => {
    expect(validateTemplate({})).toBe(false);
  });

  it("rejects unknown top-level property", () => {
    expect(
      validateTemplate({
        bodies: [{ name: "torso", shape: "box", dimensions: [1, 1, 1] }],
        elastic: true
      })
    ).toBe(false);
  });

  it("rejects body with bad shape", () => {
    expect(validateBody({ name: "torso", shape: "mesh", dimensions: [1, 1, 1] })).toBe(false);
  });

  it("rejects body with 2-element dimensions array", () => {
    expect(validateBody({ name: "torso", shape: "box", dimensions: [1, 1] })).toBe(false);
  });

  it("rejects body with negative dimensions", () => {
    expect(validateBody({ name: "torso", shape: "box", dimensions: [-1, 1, 1] })).toBe(false);
  });

  it("ragdollSpawnRequest requires templateKey", () => {
    expect(validateSpawnRequest({})).toBe(false);
    expect(validateSpawnRequest({ templateKey: "humanoid" })).toBe(true);
    expect(validateSpawnRequest({ templateKey: "humanoid", impulse: [0, 5, 0] })).toBe(true);
    expect(validateSpawnRequest({ templateKey: "humanoid", impulse: [0, 5] })).toBe(false);
  });

  it("ragdollState requires bodyEntities map + jointEntities array", () => {
    const ok = {
      templateKey: "humanoid",
      spawnedAt: 1.0,
      bodyEntities: { torso: "ent.bot.1.body.torso" },
      jointEntities: ["ent.bot.1.joint.neck"]
    };
    expect(validateState(ok)).toBe(true);
    expect(validateState({ ...ok, bodyEntities: ["wrong"] })).toBe(false);
    expect(validateState({ ...ok, jointEntities: "wrong" })).toBe(false);
  });

  it("ragdollJointDef rejects bad joint type", () => {
    expect(
      validateJoint({ name: "neck", bodyA: "a", bodyB: "b", type: "weld" })
    ).toBe(false);
    expect(
      validateJoint({ name: "neck", bodyA: "a", bodyB: "b", type: "ball" })
    ).toBe(true);
  });
});
