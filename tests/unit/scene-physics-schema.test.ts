import { describe, expect, it } from "vitest";
import Ajv, { type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schema = JSON.parse(readFileSync(resolve(repoRoot, "schemas/scene.schema.json"), "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
const validate: ValidateFunction = ajv.compile(schema);

function sceneWith(components: Record<string, unknown>) {
  return {
    id: "physics",
    entities: [{ id: "e", components: { Transform: { position: [0, 0, 0] }, ...components } }]
  };
}

describe("RigidBody3D schema (M24-schema)", () => {
  it("accepts the three v0 body kinds", () => {
    for (const type of ["fixed", "dynamic", "kinematicPosition"]) {
      expect(validate(sceneWith({ RigidBody3D: { type } }))).toBe(true);
    }
  });

  it("rejects unknown body type", () => {
    expect(validate(sceneWith({ RigidBody3D: { type: "soft" } }))).toBe(false);
  });

  it("accepts dynamic + mass + ccd + lockRotations", () => {
    expect(
      validate(
        sceneWith({
          RigidBody3D: { type: "dynamic", mass: 3, ccd: true, lockRotations: true, linearDamping: 0.1 }
        })
      )
    ).toBe(true);
  });

  it("rejects mass <= 0", () => {
    expect(validate(sceneWith({ RigidBody3D: { type: "dynamic", mass: 0 } }))).toBe(false);
    expect(validate(sceneWith({ RigidBody3D: { type: "dynamic", mass: -1 } }))).toBe(false);
  });
});

describe("Collider3D schema (M24-schema)", () => {
  it("accepts box with size", () => {
    expect(validate(sceneWith({ Collider3D: { kind: "box", size: [1, 1, 1] } }))).toBe(true);
  });

  it("rejects box without size", () => {
    expect(validate(sceneWith({ Collider3D: { kind: "box" } }))).toBe(false);
  });

  it("accepts sphere with radius", () => {
    expect(validate(sceneWith({ Collider3D: { kind: "sphere", radius: 0.5 } }))).toBe(true);
  });

  it("accepts capsule with radius + halfHeight", () => {
    expect(
      validate(sceneWith({ Collider3D: { kind: "capsule", radius: 0.35, halfHeight: 0.8 } }))
    ).toBe(true);
  });

  it("rejects capsule missing halfHeight", () => {
    expect(validate(sceneWith({ Collider3D: { kind: "capsule", radius: 0.35 } }))).toBe(false);
  });

  it("accepts sensor + layer + mask", () => {
    expect(
      validate(
        sceneWith({
          Collider3D: {
            kind: "box",
            size: [2, 2, 2],
            sensor: true,
            layer: "trigger",
            mask: ["player"],
            friction: 0.4,
            restitution: 0.2
          }
        })
      )
    ).toBe(true);
  });

  it("rejects unknown kind", () => {
    expect(validate(sceneWith({ Collider3D: { kind: "tetrahedron" } }))).toBe(false);
  });

  it("rejects restitution > 1", () => {
    expect(validate(sceneWith({ Collider3D: { kind: "sphere", radius: 1, restitution: 1.5 } }))).toBe(false);
  });

  it("rejects duplicate mask entries", () => {
    expect(
      validate(sceneWith({ Collider3D: { kind: "sphere", radius: 1, mask: ["player", "player"] } }))
    ).toBe(false);
  });
});

describe("Trimesh + heightfield colliders (M24-static-mesh)", () => {
  it("accepts a minimal trimesh (one triangle)", () => {
    expect(
      validate(
        sceneWith({
          Collider3D: {
            kind: "trimesh",
            vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1],
            indices: [0, 1, 2]
          }
        })
      )
    ).toBe(true);
  });

  it("rejects trimesh without vertices", () => {
    expect(
      validate(sceneWith({ Collider3D: { kind: "trimesh", indices: [0, 1, 2] } }))
    ).toBe(false);
  });

  it("rejects trimesh without indices", () => {
    expect(
      validate(
        sceneWith({
          Collider3D: { kind: "trimesh", vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1] }
        })
      )
    ).toBe(false);
  });

  it("accepts a minimal heightfield (2×2)", () => {
    expect(
      validate(
        sceneWith({
          Collider3D: {
            kind: "heightfield",
            rows: 2,
            columns: 2,
            heights: [0, 0, 0, 0],
            scale: [10, 1, 10]
          }
        })
      )
    ).toBe(true);
  });

  it("rejects heightfield with rows < 2", () => {
    expect(
      validate(
        sceneWith({
          Collider3D: {
            kind: "heightfield",
            rows: 1,
            columns: 2,
            heights: [0, 0],
            scale: [10, 1, 10]
          }
        })
      )
    ).toBe(false);
  });

  it("rejects heightfield missing scale", () => {
    expect(
      validate(
        sceneWith({
          Collider3D: { kind: "heightfield", rows: 2, columns: 2, heights: [0, 0, 0, 0] }
        })
      )
    ).toBe(false);
  });
});
