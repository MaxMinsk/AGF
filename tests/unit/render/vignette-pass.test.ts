// S216 ENGINE-POSTFX-VIGNETTE (GDP-2026-05-29-002 part 3). Pure
// shader-spec builder tests — we don't spin a renderer here, just
// lock the uniform defaults + the GLSL surface so the
// `three-render-adapter` integration stays predictable.

import { describe, expect, it } from "vitest";
import { Color } from "three";

import { buildVignetteShader } from "../../../engine/render/postfx/vignette-pass";

describe("engine vignette pass (S216)", () => {
  it("defaults: intensity 0.4, smoothness 0.45, color black", () => {
    const spec = buildVignetteShader();
    expect(spec.uniforms.intensity.value).toBeCloseTo(0.4, 5);
    expect(spec.uniforms.smoothness.value).toBeCloseTo(0.45, 5);
    expect(spec.uniforms.color.value).toBeInstanceOf(Color);
    expect(spec.uniforms.color.value.getHexString()).toBe("000000");
  });

  it("accepts explicit intensity + smoothness in [0, 1]", () => {
    const spec = buildVignetteShader({ intensity: 0.7, smoothness: 0.3 });
    expect(spec.uniforms.intensity.value).toBeCloseTo(0.7, 5);
    expect(spec.uniforms.smoothness.value).toBeCloseTo(0.3, 5);
  });

  it("clamps intensity + smoothness to [0, 1] for out-of-range input", () => {
    const lo = buildVignetteShader({ intensity: -1, smoothness: -0.5 });
    expect(lo.uniforms.intensity.value).toBe(0);
    expect(lo.uniforms.smoothness.value).toBe(0);
    const hi = buildVignetteShader({ intensity: 2, smoothness: 99 });
    expect(hi.uniforms.intensity.value).toBe(1);
    expect(hi.uniforms.smoothness.value).toBe(1);
  });

  it("non-finite intensity falls through to 0", () => {
    const spec = buildVignetteShader({ intensity: Number.NaN, smoothness: Number.NaN });
    expect(spec.uniforms.intensity.value).toBe(0);
    expect(spec.uniforms.smoothness.value).toBe(0);
  });

  it("color hex string parses into a Color instance", () => {
    const spec = buildVignetteShader({ color: "#1a2b3c" });
    expect(spec.uniforms.color.value.getHexString()).toBe("1a2b3c");
  });

  it("exposes tDiffuse uniform null-initialised for ShaderPass binding", () => {
    const spec = buildVignetteShader();
    expect(spec.uniforms.tDiffuse).toEqual({ value: null });
  });

  it("vertex + fragment GLSL are non-empty strings", () => {
    const spec = buildVignetteShader();
    expect(spec.vertexShader.length).toBeGreaterThan(50);
    expect(spec.fragmentShader.length).toBeGreaterThan(100);
    // Smoke-check the fragment references the expected uniforms.
    expect(spec.fragmentShader).toContain("uniform sampler2D tDiffuse");
    expect(spec.fragmentShader).toContain("uniform float intensity");
    expect(spec.fragmentShader).toContain("uniform float smoothness");
    expect(spec.fragmentShader).toContain("uniform vec3 color");
  });
});
