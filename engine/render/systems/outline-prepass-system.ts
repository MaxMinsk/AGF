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
const OUTLINE_OCCLUDER_SURFACE: ComponentName = "OutlineOccluderSurface";
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
  let surfaceQuery: QueryHandle | undefined;
  let rtHandle: number | undefined;
  let lastWidth = 0;
  let lastHeight = 0;
  let depthTexture: DepthTexture | undefined;
  // Handles currently flagged as occluder-surface via the adapter; diffed
  // against `surfaceQuery` each frame so a dropped marker untags exactly once.
  const flaggedSurfaceHandles = new Set<number>();

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
        surfaceQuery = world.createQuery([OUTLINE_OCCLUDER_SURFACE, RENDER_MESH_HANDLE]);
        cachedWorld = world;
        flaggedSurfaceHandles.clear();
      }

      // S294 — INCLUSION model. The pre-pass renders ONLY the TALL occluder
      // surfaces (meshes tagged `OutlineOccluderSurface`), so the silhouette
      // fires only behind geometry that genuinely hides a bomber. Diff the
      // marker set against the adapter so dropped tags untag exactly once.
      const seenSurface = new Set<number>();
      for (const id of surfaceQuery!.run()) {
        const h = world.getComponent<RenderMeshHandleComponent>(id, RENDER_MESH_HANDLE);
        if (h !== undefined) seenSurface.add(h.id);
      }
      for (const handle of seenSurface) {
        if (!flaggedSurfaceHandles.has(handle)) {
          deps.adapter.setMeshOutlineOccluderSurface(handle, true);
          flaggedSurfaceHandles.add(handle);
        }
      }
      for (const handle of flaggedSurfaceHandles) {
        if (!seenSurface.has(handle)) {
          deps.adapter.setMeshOutlineOccluderSurface(handle, false);
          flaggedSurfaceHandles.delete(handle);
        }
      }

      // Is the silhouette feature active at all? (any bomber/bomb OutlineOccluder)
      let anyOccluder = false;
      for (const _ of occluderQuery!.run()) { anyOccluder = true; break; }

      // Dormant when the feature is off OR there are no tall occluders to
      // hide behind (flat arena → empty surface set → no x-ray, no cost).
      if (!anyOccluder) return;
      if (deps.adapter.outlineOccluderSurfaceMeshes().size === 0) return;
      if (!ensureRenderTarget()) return;
      if (rtHandle === undefined) return;
      const camera = deps.adapter.getActiveCamera();
      if (camera === undefined) return;
      const scene = deps.adapter.getScene();

      // Render ONLY the occluder surfaces: hide every other visible mesh,
      // render the depth target, restore. (Bombers/bombs are not in the
      // surface set, so they never pollute the occluder depth.)
      const surfaces = deps.adapter.outlineOccluderSurfaceMeshes();
      const restore: Array<{ mesh: Mesh; wasVisible: boolean }> = [];
      scene.traverse((obj) => {
        const mesh = obj as Mesh;
        if (mesh.isMesh !== true) return;
        if (mesh.visible && !surfaces.has(mesh)) {
          restore.push({ mesh, wasVisible: true });
          mesh.visible = false;
        }
      });
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
