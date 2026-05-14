import { describe, expect, it } from "vitest";
import Ajv, { type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schema = JSON.parse(readFileSync(resolve(repoRoot, "schemas/material.schema.json"), "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
const validate: ValidateFunction = ajv.compile(schema);

describe("material manifest (M21-mat-physical + M21-mat-unlit)", () => {
  it("accepts all five shader kinds", () => {
    for (const shader of ["standard", "physical", "lambert", "phong", "basic"] as const) {
      expect(
        validate({ id: "m", shader, color: "#ffffff" }),
        `shader=${shader}`
      ).toBe(true);
    }
  });

  it("rejects unknown shader kind", () => {
    expect(validate({ id: "m", shader: "toon", color: "#ffffff" })).toBe(false);
  });

  it("accepts a physical material with clearcoat + transmission + iridescence", () => {
    expect(
      validate({
        id: "lacquer",
        shader: "physical",
        color: "#a3c9ff",
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        ior: 1.45,
        transmission: 0.6,
        thickness: 1.0,
        iridescence: 0.2
      })
    ).toBe(true);
  });

  it("accepts a phong material with shininess + specular", () => {
    expect(
      validate({ id: "p", shader: "phong", color: "#ffcc88", shininess: 80, specular: "#ffffff" })
    ).toBe(true);
  });

  it("rejects out-of-range clearcoat (> 1)", () => {
    expect(validate({ id: "m", shader: "physical", color: "#ffffff", clearcoat: 1.5 })).toBe(false);
  });

  it("rejects opacity above 1", () => {
    expect(validate({ id: "m", shader: "standard", color: "#fff", opacity: 1.5 })).toBe(false);
  });
});
