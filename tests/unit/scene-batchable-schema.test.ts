import { describe, expect, it } from "vitest";
import Ajv, { type ValidateFunction } from "ajv";
import { loadBundledSceneSchema } from "../../engine/tools/schemas/load-scene-schema";

const schema = loadBundledSceneSchema();
const ajv = new Ajv({ allErrors: true, strict: false });
const validate: ValidateFunction = ajv.compile(schema);

function sceneWith(batchable: unknown) {
  return {
    id: "batchable",
    entities: [
      {
        id: "e",
        components: {
          Transform: { position: [0, 0, 0] },
          MeshRenderer: { mesh: "box" },
          Batchable: batchable
        }
      }
    ]
  };
}

describe("scene Batchable component (M17-bucketer)", () => {
  it("accepts an empty Batchable component", () => {
    expect(validate(sceneWith({}))).toBe(true);
  });

  it("accepts Batchable with a group hint", () => {
    expect(validate(sceneWith({ group: "rocks" }))).toBe(true);
  });

  it("rejects unknown fields", () => {
    expect(validate(sceneWith({ group: "rocks", foo: 1 }))).toBe(false);
  });

  it("rejects empty group string", () => {
    expect(validate(sceneWith({ group: "" }))).toBe(false);
  });

  it("rejects non-string group", () => {
    expect(validate(sceneWith({ group: 42 }))).toBe(false);
  });
});
