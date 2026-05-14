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

  it("accepts texture maps (M21-mat-textures)", () => {
    expect(
      validate({
        id: "tex",
        shader: "standard",
        color: "#ffffff",
        map: "runtime/textures/brick-diffuse.png",
        normalMap: "runtime/textures/brick-normal.png",
        normalScale: 0.8,
        roughnessMap: "runtime/textures/brick-roughness.png",
        metalnessMap: "runtime/textures/brick-metalness.png",
        emissiveMap: "runtime/textures/brick-emissive.png",
        emissiveIntensity: 0.5,
        aoMap: "runtime/textures/brick-ao.png"
      })
    ).toBe(true);
  });

  it("rejects empty texture map paths", () => {
    expect(validate({ id: "bad", shader: "standard", color: "#fff", map: "" })).toBe(false);
  });

  it("accepts a custom ShaderMaterial manifest (M21-mat-custom)", () => {
    expect(
      validate({
        id: "wave",
        shader: "custom",
        color: "#4af0a8",
        vertexShader:
          "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "uniform vec3 tint; void main() { gl_FragColor = vec4(tint, 1.0); }",
        uniforms: {
          tint: "#4af0a8",
          time: 0,
          breaks: [10, 25, 60]
        },
        defines: { USE_FOG: "1" }
      })
    ).toBe(true);
  });

  it("rejects empty vertexShader source", () => {
    expect(
      validate({
        id: "bad",
        shader: "custom",
        color: "#ffffff",
        vertexShader: "",
        fragmentShader: "void main() { gl_FragColor = vec4(1.0); }"
      })
    ).toBe(false);
  });
});
