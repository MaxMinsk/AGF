import { describe, expect, it } from "vitest";
import Ajv, { type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schema = JSON.parse(readFileSync(resolve(repoRoot, "schemas/scene.schema.json"), "utf8"));
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
  it("rejects unknown kind", () => {
    expect(validate(sceneWithEnv({ kind: "cube" }))).toBe(false);
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
