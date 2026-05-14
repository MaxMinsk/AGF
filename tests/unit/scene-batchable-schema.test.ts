import { describe, expect, it } from "vitest";
import Ajv, { type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schema = JSON.parse(readFileSync(resolve(repoRoot, "schemas/scene.schema.json"), "utf8"));
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
