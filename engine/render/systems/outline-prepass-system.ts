// S278 ENGINE-OUTLINE-PRE-PASS.
//
// Drives a depth-only pre-pass that powers the outline-occluder
// silhouette material. Each frame:
//
//   1. Forward the ECS `OutlinePrePassExcluded` marker component onto
//      the adapter's exclusion set (additions + removals diffed
//      against a small per-system cache so dropped markers untag the
//      adapter mesh on the next frame — survives map restart and
//      bomber-on-death cleanup without leaking the disposed mesh).
//   2. If no entity is asking for an outline (no `OutlineOccluder`
//      anywhere), the pre-pass stays dormant — costs nothing on
//      projects that don't opt into the feature.
//   3. Snapshot `Mesh.visible` on every excluded mesh + set to false.
//   4. `adapter.renderSceneToTarget` into a half-canvas
//      `DepthTexture`.
//   5. Restore visibility.
//
// The depth texture is exposed via `getDepthTexture()` so the
// `render.outline-occluder` system (S279) can hand it to the WebGPU
// NodeMaterial. WebGL-only projects pay only the visibility toggle +
// the early-return (no NodeMaterial swap will happen, so no shader
// reads from the depth texture).

import type { DepthTexture, Mesh } from "three";

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { ThreeRenderAdapter } from "../three-render-adapter";

const OUTLINE_OCCLUDER: ComponentName = "OutlineOccluder";
const OUTLINE_PREPASS_EXCLUDED: ComponentName = "OutlinePrePassExcluded";
const RENDER_MESH_HANDLE: ComponentName = "RenderMeshHandle";

type RenderMeshHandleComponent = { id: number };

export type OutlinePrePassSystemHandle = System & {
  /** Live depth texture written by the most-recent successful pre-pass.
   *  `undefined` before the first pass — callers must tolerate the
   *  warm-up case (the outline-occluder system skips material creation
   *  while this is undefined and re-attempts the next frame). */
  getDepthTexture(): DepthTexture | undefined;
};

export type OutlinePrePassDeps = {
  adapter: ThreeRenderAdapter;
  /** Depth-target resolution as a fraction of the canvas, in
   *  `[0.25, 1]`. Default 0.5 — half the linear resolution captures
   *  enough silhouette detail while quartering pre-pass cost vs
   *  full-resolution. */
  resolutionScale?: number;
};

const DEFAULT_RESOLUTION_SCALE = 0.5;

export function createOutlinePrePassSystem(
  deps: OutlinePrePassDeps
): OutlinePrePassSystemHandle {
  const scale = Math.max(0.25, Math.min(1, deps.resolutionScale ?? DEFAULT_RESOLUTION_SCALE));
  let cachedWorld: World | undefined;
  let occluderQuery: QueryHandle | undefined;
  let excludedQuery: QueryHandle | undefined;
  let rtHandle: number | undefined;
  let lastWidth = 0;
  let lastHeight = 0;
  let depthTexture: DepthTexture | undefined;
  let loggedFirst = false;
  // Handles currently flagged via setMeshOutlinePrePassExcluded; diffed
  // against `excludedQuery` each frame so a dropped marker component
  // untags the adapter mesh exactly once.
  const flaggedHandles = new Set<number>();

  function ensureRenderTarget(): boolean {
    const camera = deps.adapter.getActiveCamera();
    if (camera === undefined) return false;
    const canvas = (deps.adapter as unknown as { canvas: HTMLCanvasElement }).canvas;
    const cw = canvas.clientWidth || canvas.width;
    const ch = canvas.clientHeight || canvas.height;
    const width = Math.max(2, Math.floor(cw * scale));
    const height = Math.max(2, Math.floor(ch * scale));
    if (rtHandle === undefined) {
      rtHandle = deps.adapter.acquireRenderTarget({
        width,
        height,
        depthTexture: true,
        nearestFilter: true
      });
      lastWidth = width;
      lastHeight = height;
      depthTexture = deps.adapter.getRenderTargetDepthTexture(rtHandle) as DepthTexture | undefined;
      return depthTexture !== undefined;
    }
    if (width !== lastWidth || height !== lastHeight) {
      deps.adapter.resizeRenderTarget(rtHandle, width, height);
      lastWidth = width;
      lastHeight = height;
      depthTexture = deps.adapter.getRenderTargetDepthTexture(rtHandle) as DepthTexture | undefined;
    }
    return depthTexture !== undefined;
  }

  return {
    name: "render.outline-prepass",
    getDepthTexture(): DepthTexture | undefined {
      return depthTexture;
    },
    frameUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        occluderQuery = world.createQuery([OUTLINE_OCCLUDER, RENDER_MESH_HANDLE]);
        excludedQuery = world.createQuery([OUTLINE_PREPASS_EXCLUDED, RENDER_MESH_HANDLE]);
        cachedWorld = world;
        flaggedHandles.clear();
      }

      // Build "this frame's exclusion set" from BOTH:
      //   • every OutlineOccluder mesh (the silhouette duplicates) — so
      //     they don't pollute the depth texture they themselves sample;
      //   • every `OutlinePrePassExcluded` mesh (the source bombers /
      //     bombs) — so the depth target sees the world WITHOUT them.
      // Diff against `flaggedHandles` to untag handles whose tagging
      // component was dropped.
      const seenHandles = new Set<number>();
      let anyOccluder = false;
      for (const id of occluderQuery!.run()) {
        anyOccluder = true;
        const h = world.getComponent<RenderMeshHandleComponent>(id, RENDER_MESH_HANDLE);
        if (h !== undefined) seenHandles.add(h.id);
      }
      for (const id of excludedQuery!.run()) {
        const h = world.getComponent<RenderMeshHandleComponent>(id, RENDER_MESH_HANDLE);
        if (h !== undefined) seenHandles.add(h.id);
      }
      for (const handle of seenHandles) {
        if (!flaggedHandles.has(handle)) {
          deps.adapter.setMeshOutlinePrePassExcluded(handle, true);
          flaggedHandles.add(handle);
        }
      }
      for (const handle of flaggedHandles) {
        if (!seenHandles.has(handle)) {
          deps.adapter.setMeshOutlinePrePassExcluded(handle, false);
          flaggedHandles.delete(handle);
        }
      }

      // Dormant when nothing needs the pre-pass.
      if (!anyOccluder) return;
      if (!ensureRenderTarget()) {
        if (!loggedFirst) {
          loggedFirst = true;
          // eslint-disable-next-line no-console
          console.warn(`[outline-prepass] ensureRenderTarget failed: camera=${deps.adapter.getActiveCamera() !== undefined}`);
        }
        return;
      }
      if (rtHandle === undefined) return;
      const camera = deps.adapter.getActiveCamera();
      if (camera === undefined) return;
      const scene = deps.adapter.getScene();
      if (!loggedFirst) {
        loggedFirst = true;
        // eslint-disable-next-line no-console
        console.log(`[outline-prepass] first pass — depthTexture=${depthTexture !== undefined}, excluded=${flaggedHandles.size}, rt=${rtHandle}, lastWidth=${lastWidth}, lastHeight=${lastHeight}`);
      }

      // Visibility toggle for every excluded mesh, render, restore.
      const restore: Array<{ mesh: Mesh; wasVisible: boolean }> = [];
      for (const mesh of deps.adapter.outlinePrePassExcludedMeshes()) {
        restore.push({ mesh, wasVisible: mesh.visible });
        mesh.visible = false;
      }
      try {
        deps.adapter.renderSceneToTarget(rtHandle, scene, camera);
      } finally {
        for (const entry of restore) entry.mesh.visible = entry.wasVisible;
      }
    }
  };
}

// Re-exported for callers that need to query the type of the system
// handle (the engine `render.outline-occluder` system holds a
// reference to call `getDepthTexture()` once per material refresh).
export type { EntityId };
