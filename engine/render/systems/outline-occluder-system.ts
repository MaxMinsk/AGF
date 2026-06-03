// S279 ENGINE-OUTLINE-OCCLUDER-SYSTEM.
//
// For every entity with `OutlineOccluder { color, opacity?, softEdge? }`
// + `RenderMeshHandle`, this system swaps the mesh's material for the
// WebGPU outline-occluder NodeMaterial — the PRE-PASS variant from
// S186 (`createOutlineOccluderMaterial`). The pre-pass depth comes
// from `render.outline-prepass` (S278), which renders the world
// WITHOUT bomber meshes; so the depth the silhouette material samples
// only ever reflects WORLD geometry. That sidesteps the intra-bomber
// bleed the live-viewport variant suffered from (head-vs-torso depth
// deltas were indistinguishable from cross-wall deltas in a single
// shared buffer).
//
// While the NodeMaterial async-loads, the duplicate is hidden via
// `setMeshVisible(handle, false)` so the default MeshStandardMaterial
// never paints over the live source. When the pre-pass depth texture
// changes (canvas resize) the per-entity applied material is dropped
// + recreated against the new texture.
//
// WebGL = no-op (the TSL graph has no WebGL fallback).

import type { DepthTexture, Material } from "three";

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { ThreeRenderAdapter } from "../three-render-adapter";

import type { OutlinePrePassSystemHandle } from "./outline-prepass-system";

export const OUTLINE_OCCLUDER: ComponentName = "OutlineOccluder";
const RENDER_MESH_HANDLE: ComponentName = "RenderMeshHandle";

export type OutlineOccluderComponent = {
  /** Silhouette colour. Hex string ('#3ab0ff') or numeric. */
  color: string | number;
  /** Opacity multiplier in [0,1]. Default 0.85. */
  opacity?: number;
  /** Soft fade window in NDC depth units. Default 0.01. */
  softEdge?: number;
};

type RenderMeshHandleComponent = { id: number };

type AppliedState = {
  color: string | number;
  opacity: number;
  softEdge: number;
  material: Material;
  handle: number;
  /** Tracks the DepthTexture instance the material captured. If the
   *  pre-pass swaps render-target (canvas resize), this changes and
   *  we rebuild the material so it samples the right depth. */
  depthTexture: DepthTexture;
};

export type OutlineOccluderDeps = {
  adapter: ThreeRenderAdapter;
  prepass: OutlinePrePassSystemHandle;
};

const DEFAULT_OPACITY = 0.85;
// NDC depth feather. Tight by default — the pre-pass depth excludes
// the bomber so we no longer need a wide feather to mask intra-bomber
// bleed; a tight value gives full opacity on any close occluder.
const DEFAULT_SOFT_EDGE = 0.01;
const OUTLINE_RENDER_ORDER = 1;

export function createOutlineOccluderSystem(deps: OutlineOccluderDeps): System {
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;
  let webgpuChecked = false;
  let webgpuActive = false;

  const applied = new Map<EntityId, AppliedState>();
  const pending = new Set<EntityId>();

  function ensureRendererKind(): boolean {
    if (webgpuChecked) return webgpuActive;
    webgpuChecked = true;
    try {
      webgpuActive = deps.adapter.info().renderer === "webgpu";
    } catch {
      webgpuActive = false;
    }
    return webgpuActive;
  }

  return {
    name: "render.outline-occluder",
    frameUpdate(context: SystemContext): void {
      if (!ensureRendererKind()) return;
      const world = context.world;
      if (world !== cachedWorld) {
        query = world.createQuery([OUTLINE_OCCLUDER, RENDER_MESH_HANDLE]);
        cachedWorld = world;
        applied.clear();
        pending.clear();
      }
      const depthTexture = deps.prepass.getDepthTexture();
      if (depthTexture === undefined) {
        // Pre-pass hasn't produced a depth target yet (warm-up frame
        // before the camera is available). Try again next frame.
        return;
      }
      const seen = new Set<EntityId>();
      for (const id of query!.run()) {
        seen.add(id);
        const cfg = world.getComponent<OutlineOccluderComponent>(id, OUTLINE_OCCLUDER);
        if (cfg === undefined) continue;
        const handleComp = world.getComponent<RenderMeshHandleComponent>(id, RENDER_MESH_HANDLE);
        if (handleComp === undefined) continue;
        const handle = handleComp.id;
        const color = cfg.color;
        const opacity = cfg.opacity ?? DEFAULT_OPACITY;
        const softEdge = cfg.softEdge ?? DEFAULT_SOFT_EDGE;
        const state = applied.get(id);
        const matches =
          state !== undefined &&
          state.handle === handle &&
          state.color === color &&
          state.opacity === opacity &&
          state.softEdge === softEdge &&
          state.depthTexture === depthTexture;
        if (matches) continue;
        if (pending.has(id)) continue;
        pending.add(id);
        // Hide the duplicate while the NodeMaterial async-loads so
        // the default MeshStandardMaterial doesn't briefly paint over
        // the live source mesh.
        deps.adapter.setMeshVisible(handle, false);
        applyOutline(deps, id, handle, { color, opacity, softEdge }, depthTexture, applied, pending);
      }
      for (const id of applied.keys()) {
        if (!seen.has(id)) applied.delete(id);
      }
    }
  };
}

function applyOutline(
  deps: OutlineOccluderDeps,
  entityId: EntityId,
  handle: number,
  opts: { color: string | number; opacity: number; softEdge: number },
  depthTexture: DepthTexture,
  applied: Map<EntityId, AppliedState>,
  pending: Set<EntityId>
): void {
  void (async () => {
    try {
      const { createOutlineOccluderMaterial } = await import(
        "../webgpu/outline-node-material"
      );
      const material = await createOutlineOccluderMaterial({
        depthTexture,
        color: opts.color,
        opacity: opts.opacity,
        softEdge: opts.softEdge
      });
      deps.adapter.setMeshMaterial(handle, material);
      deps.adapter.setMeshRenderOrder(handle, OUTLINE_RENDER_ORDER);
      deps.adapter.setMeshVisible(handle, true);
      applied.set(entityId, {
        color: opts.color,
        opacity: opts.opacity,
        softEdge: opts.softEdge,
        material,
        handle,
        depthTexture
      });
    } catch (err) {
      console.warn("[render.outline-occluder] failed to apply outline material:", err);
    } finally {
      pending.delete(entityId);
    }
  })();
}
