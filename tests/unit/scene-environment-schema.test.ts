import { describe, expect, it } from "vitest";
import Ajv, { type ValidateFunction } from "ajv";
import { loadBundledSceneSchema } from "../../engine/tools/schemas/load-scene-schema";

const schema = loadBundledSceneSchema();
const ajv = new Ajv({ allErrors: true, strict: false });
const validate: ValidateFunction = ajv.compile(schema);

function sceneWithEnv(env: unknown) {
  return {
    id: "env",
    entities: [
      { id: "e", components: { Transform: { position: [0, 0, 0] } } }
    ],
    environment: env
  };
}

describe("scene.environment (M21-env-generated)", () => {
  it("accepts kind: generated", () => {
    expect(validate(sceneWithEnv({ kind: "generated" }))).toBe(true);
  });
  it("accepts kind: none", () => {
    expect(validate(sceneWithEnv({ kind: "none" }))).toBe(true);
  });
  it("accepts kind: hdr with url (M21-env-hdr)", () => {
    expect(
      validate(sceneWithEnv({ kind: "hdr", url: "runtime/sky/forest_2k.hdr" }))
    ).toBe(true);
  });
  it("accepts kind: hdr with explicit intensity", () => {
    expect(
      validate(sceneWithEnv({ kind: "hdr", url: "runtime/sky/forest_2k.hdr", intensity: 0.6 }))
    ).toBe(true);
  });
  it("rejects kind: hdr without url", () => {
    expect(validate(sceneWithEnv({ kind: "hdr" }))).toBe(false);
  });
  it("accepts kind: cube with 6 faces (M21-env-cube)", () => {
    expect(
      validate(
        sceneWithEnv({
          kind: "cube",
          faces: [
            "runtime/sky/px.jpg",
            "runtime/sky/nx.jpg",
            "runtime/sky/py.jpg",
            "runtime/sky/ny.jpg",
            "runtime/sky/pz.jpg",
            "runtime/sky/nz.jpg"
          ]
        })
      )
    ).toBe(true);
  });
  it("accepts kind: cube with explicit intensity", () => {
    expect(
      validate(
        sceneWithEnv({
          kind: "cube",
          intensity: 0.8,
          faces: [
            "runtime/sky/px.jpg",
            "runtime/sky/nx.jpg",
            "runtime/sky/py.jpg",
            "runtime/sky/ny.jpg",
            "runtime/sky/pz.jpg",
            "runtime/sky/nz.jpg"
          ]
        })
      )
    ).toBe(true);
  });
  it("rejects kind: cube without faces", () => {
    expect(validate(sceneWithEnv({ kind: "cube" }))).toBe(false);
  });
  it("rejects kind: cube with fewer than 6 faces", () => {
    expect(
      validate(
        sceneWithEnv({
          kind: "cube",
          faces: ["runtime/sky/px.jpg", "runtime/sky/nx.jpg"]
        })
      )
    ).toBe(false);
  });
  it("rejects unknown kind", () => {
    expect(validate(sceneWithEnv({ kind: "screen-space-sky" }))).toBe(false);
  });
  it("rejects unknown sibling fields", () => {
    expect(validate(sceneWithEnv({ kind: "generated", foo: 1 }))).toBe(false);
  });
  it("makes environment optional (scene without it still validates)", () => {
    const sansEnv = {
      id: "env",
      entities: [{ id: "e", components: { Transform: { position: [0, 0, 0] } } }]
    };
    expect(validate(sansEnv)).toBe(true);
  });
});
