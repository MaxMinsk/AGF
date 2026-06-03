// S277 ENGINE-OUTLINE-OCCLUDER-SYSTEM.
//
// For every entity with `OutlineOccluder { color, opacity?, softEdge? }`
// + `RenderMeshHandle`, this system swaps the mesh's material for the
// WebGPU outline-occluder NodeMaterial (see
// `engine/render/webgpu/outline-node-material.ts`).
//
// We use the VIEWPORT variant of the outline material — it samples
// `viewportDepthTexture` (Three's WebGPU-native depth read from the
// currently-bound framebuffer). The PRE-PASS variant we tried first
// requires sampling a custom DepthTexture, which Three's WebGPU
// backend doesn't expose through `t.texture(map, uv)` cleanly without
// a full PassNode rebuild. The viewport variant gives correct
// behaviour for the dominant cross-wall case; intra-bomber overlap
// (head-vs-torso bleed) is masked by the smoothstep `softEdge`
// feathered around 0 NDC delta.
//
// WebGL = no-op (the TSL graph has no WebGL fallback). Projects can
// author OutlineOccluder freely; the system stays silent on a WebGL
// build instead of throwing.

import type { Material } from "three";

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { ThreeRenderAdapter } from "../three-render-adapter";

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
};

export type OutlineOccluderDeps = {
  adapter: ThreeRenderAdapter;
};

const DEFAULT_OPACITY = 0.85;
// NDC delta where the silhouette is fully opaque. Bomber-internal
// overlap (head-vs-torso) is typically < 0.01 NDC; cross-wall is well
// above 0.05. 0.04 balances both — most inter-part bleed faded, walls
// still fully opaque.
const DEFAULT_SOFT_EDGE = 0.04;
const OUTLINE_RENDER_ORDER = 1;

export function createOutlineOccluderSystem(deps: OutlineOccluderDeps): System {
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;
  let webgpuChecked = false;
  let webgpuActive = false;

  const applied = new Map<EntityId, AppliedState>();
  const pending = new Set<EntityId>();
  // S277 — DO NOT share material instances across meshes. The adapter's
  // `releaseMesh` disposes the mesh's material, and sharing would let
  // one entity's release tear the material out from under every other
  // outline mesh in the world (visible as: bomber silhouettes stop
  // working after a map restart, because the player.1 outline material
  // got disposed when the round-end teardown released ONE outline
  // mesh). Three's WebGPU pipeline cache de-duplicates by shader-graph
  // hash, so creating a fresh NodeMaterial per outline still hits the
  // pre-compiled pipeline — no compile-stall cost beyond the first
  // bomber of each unique colour.

  function ensureRendererKind(): boolean {
    if (webgpuChecked) return webgpuActive;
    webgpuChecked = true;
    try {
      webgpuActive = deps.adapter.info().renderer === "webgpu";
    } catch {
      webgpuActive = false;
    }
    // S277f-diag — print once at first invocation so we can read the
    // user's browser console + know whether the NodeMaterial path is
    // even active in their environment. Will be removed once the
    // outline-occluder feature stabilises.
    // eslint-disable-next-line no-console
    console.log(`[outline-occluder] webgpuActive=${webgpuActive} renderer=${(deps.adapter.info() as { renderer?: string }).renderer ?? "?"}`);
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
          state.softEdge === softEdge;
        if (matches) continue;
        if (pending.has(id)) continue;
        pending.add(id);
        // Hide the duplicate until the WebGPU NodeMaterial is ready,
        // so the default MeshStandardMaterial doesn't briefly paint
        // over the live source mesh.
        deps.adapter.setMeshVisible(handle, false);
        applyOutline(deps, id, handle, { color, opacity, softEdge }, applied, pending);
      }
      for (const id of applied.keys()) {
        if (!seen.has(id)) {
          applied.delete(id);
        }
      }
    }
  };
}

function applyOutline(
  deps: OutlineOccluderDeps,
  entityId: EntityId,
  handle: number,
  opts: { color: string | number; opacity: number; softEdge: number },
  applied: Map<EntityId, AppliedState>,
  pending: Set<EntityId>
): void {
  void (async () => {
    try {
      const { createOutlineOccluderViewportMaterial } = await import(
        "../webgpu/outline-node-material"
      );
      const material = await createOutlineOccluderViewportMaterial({
        color: opts.color,
        opacity: opts.opacity,
        softEdge: opts.softEdge
      });
      deps.adapter.setMeshMaterial(handle, material);
      deps.adapter.setMeshRenderOrder(handle, OUTLINE_RENDER_ORDER);
      // NodeMaterial is now in place — safe to make the duplicate
      // visible. From here the smoothstep opacityNode controls draw
      // (0 alpha when the source is visible, 0.85 when occluded).
      deps.adapter.setMeshVisible(handle, true);
      // eslint-disable-next-line no-console
      console.log(`[outline-occluder] applied NodeMaterial to ${entityId} (color=${opts.color}, softEdge=${opts.softEdge})`);
      applied.set(entityId, {
        color: opts.color,
        opacity: opts.opacity,
        softEdge: opts.softEdge,
        material,
        handle
      });
    } catch (err) {
      console.warn("[render.outline-occluder] failed to apply outline material:", err);
    } finally {
      pending.delete(entityId);
    }
  })();
}
