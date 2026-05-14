import { describe, expect, it } from "vitest";
import { getByPath, setByPath } from "../../engine/runtime/dev-tuner";

describe("dev-tuner path helpers", () => {
  it("getByPath returns the whole object on empty path", () => {
    const obj = { a: 1 };
    expect(getByPath(obj, "")).toBe(obj);
  });

  it("getByPath walks dotted paths", () => {
    const obj = { shadow: { bias: -0.001, camera: { far: 40 } } };
    expect(getByPath(obj, "shadow.bias")).toBe(-0.001);
    expect(getByPath(obj, "shadow.camera.far")).toBe(40);
  });

  it("getByPath returns undefined for missing keys", () => {
    expect(getByPath({}, "shadow.bias")).toBeUndefined();
    expect(getByPath(undefined, "x")).toBeUndefined();
    expect(getByPath({ shadow: null }, "shadow.bias")).toBeUndefined();
  });

  it("setByPath writes a leaf without losing siblings", () => {
    const obj = { intensity: 1, shadow: { bias: -0.001, normalBias: 0.02 } };
    setByPath(obj, "shadow.bias", -0.005);
    expect(obj.shadow.bias).toBe(-0.005);
    expect(obj.shadow.normalBias).toBe(0.02);
    expect(obj.intensity).toBe(1);
  });

  it("setByPath creates intermediate objects on demand", () => {
    const obj: Record<string, unknown> = {};
    setByPath(obj, "shadow.camera.far", 30);
    expect((obj as { shadow: { camera: { far: number } } }).shadow.camera.far).toBe(30);
  });

  it("setByPath replaces non-object intermediate values", () => {
    const obj: Record<string, unknown> = { shadow: null };
    setByPath(obj, "shadow.bias", -0.005);
    expect((obj as { shadow: { bias: number } }).shadow.bias).toBe(-0.005);
  });
});
