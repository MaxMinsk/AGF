// S277 KABOOM-OUTLINE-OCCLUDER-V2 — see-through bomber silhouettes via
// the engine WebGPU outline-occluder NodeMaterial.
//
// Per bomber root (every entity that owns a `LimbPivots` component):
//   - find its named body parts (torso/head/upper+forearm L+R/upper+lower-leg L+R)
//   - for each part with a `MeshRenderer`, spawn ONE outline duplicate
//     entity `<part>.outline-occluder` exactly ONCE with:
//       * Transform { parent: <part>, identity local }
//       * MeshRenderer { mesh: <same mesh ref> }
//       * OutlineOccluder { color: <bomber palette colour>, opacity }
//
// The engine's `render.outline-occluder` system then swaps the mesh's
// material for the WebGPU NodeMaterial. WebGL = no-op.
//
// Perf — the discovery loop ONLY runs for roots we haven't outlined yet
// (`pendingRoots`). Once every part of a root is outlined the root is
// retired from the pending set and the per-frame cost drops to a single
// cached `query.run()` + a `done.has(root)` check. No allocations.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import { bomberPuffColor } from "./bomber-palette";

const LIMB_PIVOTS: ComponentName = "LimbPivots";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const TRANSFORM: ComponentName = "Transform";
const OUTLINE_OCCLUDER: ComponentName = "OutlineOccluder";

const PART_SUFFIXES: ReadonlyArray<string> = [
  "torso",
  "head",
  "upperArmL",
  "upperArmR",
  "forearmL",
  "forearmR",
  "upperLegL",
  "upperLegR",
  "lowerLegL",
  "lowerLegR"
];

const OUTLINE_SUFFIX = "outline-occluder";
const FALLBACK_COLOR = "#7fd6ff";
const OUTLINE_OPACITY = 0.85;
const OUTLINE_SOFT_EDGE = 0.02;

type MeshRendererLike = { mesh: string };

export type BomberOutlineSystemOptions = {
  /** Outline opacity in [0,1]. Default 0.85. */
  opacity?: number;
  /** Soft-edge NDC depth window for the smoothstep mask. Default 0.02. */
  softEdge?: number;
};

export function createKaboomBomberOutlineSystem(
  options: BomberOutlineSystemOptions = {}
): System {
  const opacity = options.opacity ?? OUTLINE_OPACITY;
  const softEdge = options.softEdge ?? OUTLINE_SOFT_EDGE;
  let cachedWorld: World | undefined;
  let rootQuery: QueryHandle | undefined;
  // Roots whose outline duplicates have all been emitted at least once.
  // Stays small (≤ live bomber count). Cleared on world swap.
  const done = new Set<EntityId>();

  return {
    name: "kaboom.bomber-outline",
    frameUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        rootQuery = world.createQuery([LIMB_PIVOTS]);
        cachedWorld = world;
        done.clear();
      }
      const live = new Set<EntityId>();
      for (const rootId of rootQuery!.run()) {
        live.add(rootId);
        if (done.has(rootId)) continue;
        const color = bomberPuffColor(world, rootId) ?? FALLBACK_COLOR;
        let allSpawned = true;
        for (const suffix of PART_SUFFIXES) {
          const partId = `${rootId}.${suffix}`;
          if (!world.hasEntity(partId)) {
            // The bomber tree may still be mid-spawn — try again next frame.
            allSpawned = false;
            continue;
          }
          const renderer = world.getComponent<MeshRendererLike>(partId, MESH_RENDERER);
          if (renderer === undefined) {
            allSpawned = false;
            continue;
          }
          const outlineId = `${partId}.${OUTLINE_SUFFIX}`;
          if (world.hasEntity(outlineId)) continue;
          world.addEntity(outlineId);
          world.setComponent(outlineId, TRANSFORM, {
            parent: partId,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          });
          // Initial `transparent: true, opacity: 0` keeps the duplicate
          // invisible for the one frame between the kaboom system
          // adding the entity and the engine `render.outline-occluder`
          // system swapping in the WebGPU NodeMaterial. Without this
          // guard, very-short-lived hosts (bombs about to detonate)
          // flash a default white mesh.
          world.setComponent(outlineId, MESH_RENDERER, {
            mesh: renderer.mesh,
            transparent: true,
            opacity: 0
          });
          world.setComponent(outlineId, OUTLINE_OCCLUDER, { color, opacity, softEdge });
        }
        if (allSpawned) done.add(rootId);
      }
      // GC: when a bomber root disappears, explicitly remove every
      // outline duplicate it owned. Three's Transform.parent removal
      // doesn't cascade through the ECS — the duplicate would otherwise
      // keep its MeshRenderer + render at a stale location.
      for (const rootId of done) {
        if (live.has(rootId)) continue;
        for (const suffix of PART_SUFFIXES) {
          const outlineId = `${rootId}.${suffix}.${OUTLINE_SUFFIX}`;
          if (world.hasEntity(outlineId)) world.removeEntity(outlineId);
        }
        done.delete(rootId);
      }
    }
  };
}
