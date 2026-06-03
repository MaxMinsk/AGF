// S273 + S274 KABOOM-OUTLINE-OCCLUDER (GDP-2026-05-28-014).
//
// Goal: when a bomber is hidden behind a hard / soft block, paint a
// solid-colour silhouette of the WHOLE character through the wall so
// the player never loses track. When the bomber is visible, render
// normally (no silhouette artefacts).
//
// HOW
//   1. Mark every bomber MESH PART (torso / head / arms / legs /
//      accessories) with stencilWrite=true + stencilRef=BOMBER_STENCIL_REF
//      + stencilFunc='always' + stencilZPass='replace'. As each part
//      renders normally, it stamps the stencil buffer at its pixels
//      with the bomber's ref.
//   2. Spawn ONE outline duplicate per bomber: a cylinder pillar
//      parented to the bomber root, sized to cover the whole
//      character (head + torso + legs ≈ 1.2 cells tall). The
//      pillar's material:
//        - depthFunc = 'greater' so it draws ONLY where another
//          opaque object writes a smaller depth in front (the wall).
//        - stencilFunc = 'notEqual' + stencilRef = BOMBER_STENCIL_REF
//          so pixels owned by the bomber itself (any of its parts)
//          are SKIPPED — no S273-style self-occlusion artefacts
//          painting torso silhouette over the head.
//        - transparent + opacity 0.85 for the legible solid feel.
//
// Toggle: `?occluderOutline=off` at the bootstrap (default on).
//
// Why a single pillar (vs per-part outline duplicates):
//   The stencil mask guarantees the outline never overlaps real
//   bomber pixels, so a generic shape covering the character's
//   footprint is enough to read as "there's a bomber here". A
//   per-part duplicate would be a more faithful silhouette but
//   triples the geometry budget for no functional gain.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import { bomberPuffColor } from "./bomber-palette";

const BOMBER_STATS: ComponentName = "BomberStats";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const TRANSFORM: ComponentName = "Transform";

/** S274 — stencil ref used to mark "this is a bomber" in the buffer.
 *  Any unused 8-bit value works; we pick 1 so other consumers can
 *  claim 2..255 later. */
export const BOMBER_STENCIL_REF = 1;

/** Fallback colour when bomberPuffColor returns undefined. */
const DEFAULT_OUTLINE_COLOR = "#7fd6ff";

/** Opacity multiplier on the outline material. */
const OUTLINE_OPACITY = 0.85;

/** S274 — outline pillar dimensions. Width matches the torso roughly;
 *  height covers head + torso + legs. The cylinder primitive is
 *  1×1×1 in local units so the scale vector is the world-space size. */
const OUTLINE_PILLAR_WIDTH = 0.45;
const OUTLINE_PILLAR_HEIGHT = 1.2;
const OUTLINE_PILLAR_CENTER_Y = OUTLINE_PILLAR_HEIGHT / 2;

export type BomberOutlineSystemOptions = {
  /** Master toggle. When false the system is a no-op. */
  enabled: boolean;
  name?: string;
};

type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};

type MeshRendererPatch = {
  stencilWrite?: boolean;
  stencilRef?: number;
  stencilFunc?: string;
  stencilZPass?: string;
};

/** Derive the outline pillar entity id for a bomber root. */
export function outlineEntityIdFor(bomberRootId: EntityId): EntityId {
  return `${bomberRootId}.outline-pillar`;
}

/** Test surface for the pillar dimensions. */
export const OUTLINE_PILLAR_DIMS = {
  width: OUTLINE_PILLAR_WIDTH,
  height: OUTLINE_PILLAR_HEIGHT,
  centerY: OUTLINE_PILLAR_CENTER_Y
} as const;

export function createKaboomBomberOutlineSystem(options: BomberOutlineSystemOptions): System {
  const name = options.name ?? "kaboom.bomber-outline";
  const enabled = options.enabled;

  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;
  // Per-(world, bomber) cache for the outline pillar. Cleared on
  // world swap. We re-stamp bomber-part stencil refs every tick
  // because new mesh parts (accessories, debris, etc.) can land
  // after the first sighting.
  const seenPillar = new Set<EntityId>();

  const fixedUpdate = (context: SystemContext): void => {
    if (!enabled) return;
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS]);
      cachedWorld = world;
      seenPillar.clear();
    }

    for (const bomberId of bombers!.run()) {
      // 1. Spawn / ensure the outline pillar at the bomber root.
      const outlineId = outlineEntityIdFor(bomberId);
      if (!seenPillar.has(bomberId) || !world.hasEntity(outlineId)) {
        if (!world.hasEntity(outlineId)) world.addEntity(outlineId);
        const color = bomberPuffColor(world, bomberId) ?? DEFAULT_OUTLINE_COLOR;
        const transform: TransformLike = {
          parent: bomberId,
          position: [0, OUTLINE_PILLAR_CENTER_Y, 0],
          rotation: [0, 0, 0],
          scale: [OUTLINE_PILLAR_WIDTH, OUTLINE_PILLAR_HEIGHT, OUTLINE_PILLAR_WIDTH]
        };
        world.setComponent(outlineId, TRANSFORM, transform);
        world.setComponent(outlineId, MESH_RENDERER, {
          mesh: "cylinder",
          color,
          depthFunc: "greater",
          depthWrite: false,
          transparent: true,
          opacity: OUTLINE_OPACITY,
          stencilFunc: "notEqual",
          stencilRef: BOMBER_STENCIL_REF
        });
        seenPillar.add(bomberId);
      }

      // 2. Stamp the bomber's mesh-part children with stencil write so
      //    every pixel the bomber occupies marks the buffer with the
      //    BOMBER_STENCIL_REF. The pillar then SKIPS those pixels via
      //    its stencilFunc='notEqual' — that's what kills the S273
      //    self-occlusion (outline-of-torso painting through head).
      stampBomberStencil(world, bomberId, outlineId);
    }
  };

  return { name, fixedUpdate };
}

/** Find every entity whose id starts with `${bomberId}.` and carries
 *  a MeshRenderer; add stencil-write fields to the renderer so the
 *  buffer carries `BOMBER_STENCIL_REF` at every bomber-part pixel.
 *  Idempotent — already-stamped parts get a no-op write. */
function stampBomberStencil(world: World, bomberId: EntityId, outlineId: EntityId): void {
  const prefix = `${bomberId}.`;
  for (const id of world.entityIds()) {
    if (!id.startsWith(prefix)) continue;
    if (id === outlineId) continue; // pillar is the outline itself, skip
    if (!world.hasComponent(id, MESH_RENDERER)) continue;
    const mesh = world.getComponent<MeshRendererPatch & { mesh?: string; color?: string }>(id, MESH_RENDERER);
    if (mesh === undefined) continue;
    if (
      mesh.stencilWrite === true
      && mesh.stencilRef === BOMBER_STENCIL_REF
      && mesh.stencilFunc === "always"
      && mesh.stencilZPass === "replace"
    ) {
      continue;
    }
    world.setComponent(id, MESH_RENDERER, {
      ...mesh,
      stencilWrite: true,
      stencilRef: BOMBER_STENCIL_REF,
      stencilFunc: "always",
      stencilZPass: "replace"
    });
  }
}
