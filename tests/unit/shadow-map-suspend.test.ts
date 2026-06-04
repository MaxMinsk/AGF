// QA-2026-06-04-001 — an off-screen pre-pass render (outline prepass) must not
// consume or bake the dynamic-shadow map. withShadowMapSuspended guards it.

import { describe, expect, it } from "vitest";

import { withShadowMapSuspended } from "../../engine/render/three-render-adapter";

describe("withShadowMapSuspended (QA-2026-06-04-001)", () => {
  it("suspends autoUpdate + needsUpdate during the callback", () => {
    const sm = { autoUpdate: false, needsUpdate: true };
    let seenAuto = true, seenNeeds = true;
    withShadowMapSuspended(sm, () => {
      seenAuto = sm.autoUpdate;
      seenNeeds = sm.needsUpdate;
    });
    // Inside the pre-pass render the shadow map is fully suspended → no bake.
    expect(seenAuto).toBe(false);
    expect(seenNeeds).toBe(false);
  });

  it("restores the queued needsUpdate token so the main render still bakes", () => {
    const sm = { autoUpdate: false, needsUpdate: true };
    withShadowMapSuspended(sm, () => { /* pre-pass render */ });
    expect(sm.needsUpdate).toBe(true);
    expect(sm.autoUpdate).toBe(false);
  });

  it("restores the autoUpdate=true case too", () => {
    const sm = { autoUpdate: true, needsUpdate: false };
    withShadowMapSuspended(sm, () => {});
    expect(sm.autoUpdate).toBe(true);
    expect(sm.needsUpdate).toBe(false);
  });

  it("restores state even when the render throws", () => {
    const sm = { autoUpdate: false, needsUpdate: true };
    expect(() => withShadowMapSuspended(sm, () => { throw new Error("render boom"); })).toThrow("render boom");
    expect(sm.needsUpdate).toBe(true);
  });
});
