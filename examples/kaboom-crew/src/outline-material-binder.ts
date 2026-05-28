// S187 KABOOM-OUTLINE-OCCLUDER. Bind the TSL viewport-sampling outline
// material to each spawned outline-sibling mesh once it has a renderer
// handle. WebGPU only — the TSL graph has no direct WebGL fallback;
// projects gate at the binder layer instead of inside the engine.
//
// Pattern mirrors startVertexColorsPoller (S171): rAF tick, scan the
// snapshot for unbound entities, key the "already done" set by HANDLE
// id so a scene-reset reacquires get bound again.

import type { RuntimeHandle } from "../../../engine/runtime/start";
import { paletteByName, applyPaletteOverrides } from "../../procbomber-bench/src/generators/bomber-palette";
import { resolveRecipeFromSeed } from "../../procbomber-bench/src/character-recipe";

const RENDER_ORDER = 1000;

export function startOutlineMaterialBinder(runtime: RuntimeHandle): void {
  if (typeof requestAnimationFrame === "undefined") return;
  if (runtime.renderer.info().renderer !== "webgpu") return; // S186 material is WebGPU-only.

  // Lazy factory load — only paid for once + only on WebGPU sessions.
  const factoryPromise = import("../../../engine/render/webgpu/outline-node-material");

  const patched = new Set<number>();
  const inflight = new Set<number>();

  const tick = (): void => {
    try {
      const snap = runtime.snapshot();
      const registry = runtime.renderer.meshRegistry();
      for (const entity of snap.entities) {
        const om = (entity.components as Record<string, { ownerEntityId?: string } | undefined>)["OutlineMember"];
        if (om?.ownerEntityId === undefined) continue;
        const handle = registry.handleFor(entity.id);
        if (handle === undefined) continue;
        if (patched.has(handle) || inflight.has(handle)) continue;

        const owner = om.ownerEntityId;
        const palette = resolvePaletteForOwner(owner);
        inflight.add(handle);
        factoryPromise.then(async (mod) => {
          const material = await mod.createOutlineOccluderViewportMaterial({
            color: palette.head,
            opacity: 0.85,
            softEdge: 0.012
          });
          // The mesh handle may have been released by a scene-reset in
          // the time the factory was awaited — guard before stamping.
          if (runtime.renderer.adapter.hasMesh?.(handle) === false) {
            inflight.delete(handle);
            return;
          }
          runtime.renderer.adapter.setMeshMaterial(handle, material);
          runtime.renderer.adapter.setMeshRenderOrder(handle, RENDER_ORDER);
          patched.add(handle);
          inflight.delete(handle);
        }).catch(() => {
          inflight.delete(handle);
        });
      }
    } catch {
      // best-effort
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function resolvePaletteForOwner(ownerEntityId: string): { head: string } {
  const recipe = resolveRecipeFromSeed(ownerEntityId);
  return applyPaletteOverrides(paletteByName(recipe.paletteName), recipe.paletteOverrides);
}
