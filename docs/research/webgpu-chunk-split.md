# WebGPU chunk-split investigation (S83 AGF-WEBGPU-CHUNK-SPLIT)

## Question

S70 introduced a Vite `manualChunks` rule meant to split
`three/build/three.webgpu.js` into its own `three-webgpu-*.js`
chunk so WebGL-only projects don't pay for the ~145 KB gzipped
TSL / node-material runtime. CI's bundle budget was set to 340 KB
on that assumption.

The S82 sprint discovered the rule never produced a separate chunk
in any production build. The full `three-` chunk weighs ~536 KB
gzipped, and the bundle budget was bumped to 560 KB to unblock CI.

This note records the investigation done in S83 and the way out.

## Reproduction

```
$ rm -rf dist
$ npm run build
$ ls dist/assets/three*
dist/assets/three-CKOduTiW.js          # 1.83 MB raw / 536 KB gzipped
dist/assets/three-renderer-BJavd1Nm.js #   77 KB raw /  23 KB gzipped
```

There is no `three-webgpu-*` artifact regardless of the manualChunks
rule shape. The `three-renderer-*` chunk is a separate piece of
engine code (the renderer adapter) — not the WebGPU runtime.

## What we tried

1. **Plain string return for `three.webgpu`** (S70 baseline). Rule
   matched the file by id but Rollup folded it back into `three-`.

2. **String return for `three.webgpu` + `three.tsl` + `three.webgpu.nodes`**
   (S83). Same result — every TSL module lands in `three-`.

3. **Inverting the rule** (catch `three.webgpu*` BEFORE the bare
   `three` match). Order doesn't matter when the resulting chunks
   share too many modules.

## Root cause

`three.webgpu.js`, `three.tsl.js`, `three.webgpu.nodes.js` and
`three.module.js` share a large pool of transitive dependencies
(`three.core.js`, geometry helpers, math, loaders, shadow-map
helpers). When the manualChunks function asks Rollup to put
`three.webgpu` in chunk A and `three.module` in chunk B, Rollup
sees that the bodies of A and B both reference the SAME shared
modules and concludes the shared code can only live in one place.
Static manualChunks doesn't know how to split a shared dependency
graph — it assigns each module to exactly one chunk and falls back
to the larger receiver when there is overlap.

Because the renderer's `webgpu-module-loader.ts` is the only place
that imports `three/webgpu`, you might expect the chunk graph to be
clean (`three.webgpu.js` only reachable from the dynamic import).
That's NOT what happens — `three.webgpu.js` re-exports much of
`three.module.js`, and the engine adapter uses `import * as THREE
from "three"` (statically) for the WebGL path. The static import
pulls in the same modules that `three.webgpu` would, so Rollup
treats them as eagerly required.

## Path forward

A real split needs both:

1. **Single edge to `three/webgpu`.** Only one file (the WebGPU
   adapter) is allowed to import from `three/webgpu` / `three/tsl`,
   and only via dynamic `import()`. The render-import-boundary
   check from S70 partially covers this — extend it to forbid
   static imports of `three/webgpu*` outside the loader.

2. **WebGL-side imports don't transitively pull WebGPU re-exports.**
   Audit every `import ... from "three"` in `engine/render/**`;
   replace with `import ... from "three/build/three.module.js"` (or
   the equivalent narrow specifier) when the engine only needs the
   WebGL-side surface. Today the bare `"three"` specifier resolves
   to `three.module.js`, but if anything in the engine reaches into
   `three/examples/jsm/...` that happens to live inside a module
   that three.webgpu also exports, the WebGL chunk still grows.

When that lands, the manualChunks rule already in `vite.config.ts`
should start producing a real `three-webgpu-*` artifact and the
`three-` budget can return toward ~340 KB.

## Status

- vite.config.ts manualChunks rule kept as the eventual hook
  (matches `three.webgpu*` + `three.tsl*`).
- `scripts/check-bundle-size.mjs` three- budget stays at 560 KB.
- Closing this story as investigation-only — the refactor work
  needed for an actual split lives in a future sprint under the
  WebGPU adapter cleanup epic.
