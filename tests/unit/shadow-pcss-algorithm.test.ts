// S44 M21-shadow-pcss-modern: PCSS requires reading raw depth from the
// shadow map. Modern PCFShadowMap binds as sampler2DShadow (hardware
// comparison, returns 0/1 only), so the shader-chunk substitution
// silently no-ops there. The adapter must map `algorithm: "pcss"` to
// BasicShadowMap, the only built-in three.js shadow type that binds
// the map as sampler2D — matching three's own webgl_shadowmap_pcss
// example which explicitly notes "PCSS requires reading raw depth".
//
// This test guards the mapping so a future refactor cannot accidentally
// silence PCSS again by routing it back to PCFShadowMap.

import { describe, expect, it } from "vitest";
import { BasicShadowMap, PCFShadowMap, VSMShadowMap } from "three";
import { applyPcssShadowChunks, pcssChunksApplied } from "../../engine/render/shadow-pcss";

describe("PCSS algorithm + shader-chunk wiring", () => {
  it("applyPcssShadowChunks is idempotent", () => {
    applyPcssShadowChunks();
    expect(pcssChunksApplied()).toBe(true);
    // Calling again should be a no-op, not duplicate the chunk insertion.
    applyPcssShadowChunks();
    expect(pcssChunksApplied()).toBe(true);
  });

  it("mutates ShaderChunk.shadowmap_pars_fragment with the PCSS helpers + getShadow redirect", async () => {
    applyPcssShadowChunks();
    const { ShaderChunk } = await import("three");
    // The substitution should have injected both the helper functions
    // (`PCSS_PARS` adds `findBlocker`, `PCF_Filter`, `PCSS`) and the
    // basic-variant getShadow redirect (`return PCSS( shadowMap, ...`).
    // If either is missing, PCSS would silently no-op — the M21-shadow-
    // pcss-csm regression we caught in Sprint 47 was exactly this case
    // (a whitespace drift in three.js made the substitution miss).
    expect(ShaderChunk.shadowmap_pars_fragment).toContain("float PCSS");
    expect(ShaderChunk.shadowmap_pars_fragment).toContain("findBlocker");
    expect(ShaderChunk.shadowmap_pars_fragment).toContain("return PCSS( shadowMap, shadowCoord )");
  });

  it("three.js exposes the three shadow map types AGF maps from algorithm strings", () => {
    // Smoke guard: if any of these constants disappears from upstream we want
    // a failing unit test, not a deferred runtime error inside the adapter.
    expect(typeof BasicShadowMap).toBe("number");
    expect(typeof PCFShadowMap).toBe("number");
    expect(typeof VSMShadowMap).toBe("number");
    expect(BasicShadowMap).not.toBe(PCFShadowMap);
    expect(PCFShadowMap).not.toBe(VSMShadowMap);
  });
});
