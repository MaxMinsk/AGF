import { describe, expect, it } from "vitest";
import Ajv, { type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schema = JSON.parse(
  readFileSync(resolve(repositoryRoot, "schemas/scene.schema.json"), "utf8")
);

const ajv = new Ajv({ allErrors: true, strict: false });
const validate: ValidateFunction = ajv.compile(schema);

function sceneWith(component: unknown) {
  return {
    id: "lights-test",
    entities: [
      {
        id: "e",
        components: {
          Transform: { position: [0, 0, 0] },
          Light: component
        }
      }
    ]
  };
}

function shadowFlagsScene(flags: unknown) {
  return {
    id: "shadow-test",
    entities: [
      {
        id: "mesh",
        components: {
          Transform: { position: [0, 0, 0] },
          MeshRenderer: { mesh: "box" },
          ShadowFlags: flags
        }
      }
    ]
  };
}

describe("scene Light component (M21-light-schema)", () => {
  it("accepts every supported kind with minimal fields", () => {
    for (const kind of ["directional", "point", "spot", "ambient", "hemisphere", "rect-area"] as const) {
      const minimal: Record<string, unknown> = { kind };
      if (kind === "spot") (minimal as { angle: number }).angle = 0.5;
      expect(validate(sceneWith(minimal))).toBe(true);
    }
  });

  it("rejects unknown kinds", () => {
    expect(validate(sceneWith({ kind: "spotlight" }))).toBe(false);
  });

  it("rejects negative intensity", () => {
    expect(validate(sceneWith({ kind: "point", intensity: -1 }))).toBe(false);
  });

  it("rejects malformed color hex", () => {
    expect(validate(sceneWith({ kind: "directional", color: "white" }))).toBe(false);
  });

  it("accepts directional with full shadow config", () => {
    const ok = validate(
      sceneWith({
        kind: "directional",
        color: "#fff8e7",
        intensity: 2,
        castShadow: true,
        shadow: {
          mapSize: 2048,
          bias: -0.0005,
          camera: { left: -20, right: 20, top: 20, bottom: -20, near: 0.1, far: 50 }
        },
        target: "world.origin"
      })
    );
    expect(ok).toBe(true);
  });

  it("rejects unsupported mapSize values", () => {
    expect(validate(sceneWith({ kind: "directional", castShadow: true, shadow: { mapSize: 333 } }))).toBe(false);
  });

  it("accepts spot with cone params", () => {
    expect(validate(sceneWith({ kind: "spot", angle: 0.6, penumbra: 0.3, distance: 12, decay: 2 }))).toBe(true);
  });

  it("rejects spot cone angle larger than π/2", () => {
    expect(validate(sceneWith({ kind: "spot", angle: 2.0 }))).toBe(false);
  });
});

describe("scene ShadowFlags component (M21-shadow-basic)", () => {
  it("accepts cast/receive booleans", () => {
    expect(validate(shadowFlagsScene({ cast: true, receive: false }))).toBe(true);
    expect(validate(shadowFlagsScene({}))).toBe(true);
  });

  it("rejects unknown fields", () => {
    expect(validate(shadowFlagsScene({ cast: true, foo: 1 }))).toBe(false);
  });

  it("rejects non-boolean values", () => {
    expect(validate(shadowFlagsScene({ cast: "yes" }))).toBe(false);
  });
});
