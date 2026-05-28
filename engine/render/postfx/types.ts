// S185 ENGINE-POSTFX-PRIMITIVE. Foundational render-target primitive
// that unlocks multi-pass effects (outline-occluder, bloom, SSAO, DOF,
// custom shader composites). Project code requests a target via
// `acquireRenderTarget`, renders the scene into it with
// `renderSceneToTarget`, and reads back the colour / depth via the
// texture accessors so a follow-up pass can sample them.
//
// Wraps Three.js `WebGLRenderTarget` + the equivalent WebGPU primitive
// behind an opaque handle so projects don't import three.js directly.

import type { Texture } from "three";

/** Opaque handle. Numeric internally but tagged so call sites are clear. */
export type RenderTargetHandle = number & { readonly __rtBrand: unique symbol };

export type RenderTargetSpec = {
  width: number;
  height: number;
  /** When true, allocate a `DepthTexture` so passes that follow can
   *  sample scene depth (the building block for outline-occluder).
   *  Defaults to false (no depth-texture allocation). */
  depthTexture?: boolean;
  /** When true, set min/mag filter to nearest — useful for postfx
   *  passes that need 1:1 pixel sampling without bilinear blur. */
  nearestFilter?: boolean;
};

export type RenderTargetTextures = {
  /** Colour texture written by `renderSceneToTarget`. */
  color: Texture;
  /** Depth texture — present only when the target was acquired with
   *  `depthTexture: true`. */
  depth?: Texture;
};
