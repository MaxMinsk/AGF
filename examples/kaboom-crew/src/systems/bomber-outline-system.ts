// S273 KABOOM-OUTLINE-OCCLUDER (GDP-2026-05-28-014).
//
// Spawns + maintains a duplicate "outline" mesh attached to every
// bomber's torso. The duplicate uses the S184 ThreeRenderAdapter
// plumbing (depthFunc='greater' + depthWrite=false) which the
// S273 schema extension to MeshRenderer exposes — when the torso
// is hidden behind a hard block / soft block, the depth buffer at
// the bomber's screen position holds the OCCLUDER's depth (smaller
// than the torso's). The outline's depthFunc='greater' fires there
// → silhouette renders as a coloured shape visible through the wall.
//
// V0 SCOPE — torso only. Bombers in kaboom are 19-entity trees
// (torso / head / arms / legs / accessories); duplicating every
// part is a meatier follow-up. Torso alone is enough to NOT LOSE
// the bomber in chaotic moments — the head sits a few cells up
// from the legs so any partial silhouette reads as "there's a
// bomber here."
//
// Toggle: `?occluderOutline=off` at the bootstrap (default on).

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import { bomberPuffColor } from "./bomber-palette";

const BOMBER_STATS: ComponentName = "BomberStats";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const TRANSFORM: ComponentName = "Transform";

/** S273 — fallback colour used when bomberPuffColor returns undefined
 *  (unknown placer). High-saturation cyan so the outline still reads. */
const DEFAULT_OUTLINE_COLOR = "#7fd6ff";

/** S273 — opacity multiplier on the outline material. Reads as a
 *  legible silhouette without overpowering the live scene. */
const OUTLINE_OPACITY = 0.85;

/** S273 — polygon-offset pair the outline uses to dodge z-fighting
 *  with the original torso when the depthFunc test would normally
 *  draw both at the same depth. Negative offsets push the geometry
 *  TOWARD the camera in depth — combined with depthFunc='greater'
 *  this means a thin "halo" appears around the torso edges even when
 *  visible, but the silhouette dominates only when occluded. */
const OUTLINE_POLYGON_OFFSET = { factor: -1, units: -1 } as const;

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

/** Pure helper — derive the outline mesh entity id from a bomber root. */
export function outlineEntityIdFor(bomberRootId: EntityId): EntityId {
  return `${bomberRootId}.torso-outline`;
}

/** Pure helper — derive the torso entity id (mirrors the
 *  spawnBomberTree naming in `examples/procbomber-bench`). */
export function torsoEntityIdFor(bomberRootId: EntityId): EntityId {
  return `${bomberRootId}.torso`;
}

export function createKaboomBomberOutlineSystem(options: BomberOutlineSystemOptions): System {
  const name = options.name ?? "kaboom.bomber-outline";
  const enabled = options.enabled;

  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;
  // Per-(world, bomber) cache — avoids re-spawning the outline mesh
  // every frame. Cleared on world swap (scene.load) so a fresh round
  // re-spawns the outlines.
  const seen = new Set<EntityId>();

  const fixedUpdate = (context: SystemContext): void => {
    if (!enabled) return;
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS]);
      cachedWorld = world;
      seen.clear();
    }

    for (const bomberId of bombers!.run()) {
      const outlineId = outlineEntityIdFor(bomberId);
      // Skip when the outline is already mounted. When the outline is
      // missing (never spawned, or deleted by an editor / round
      // restart that wiped the world), re-mount THIS tick.
      if (seen.has(bomberId) && world.hasEntity(outlineId)) continue;
      const torsoId = torsoEntityIdFor(bomberId);
      if (!world.hasEntity(torsoId)) continue;
      const torsoMesh = world.getComponent<{ mesh?: string }>(torsoId, MESH_RENDERER);
      if (torsoMesh?.mesh === undefined) continue;

      // Spawn the outline duplicate.
      if (!world.hasEntity(outlineId)) world.addEntity(outlineId);
      const color = bomberPuffColor(world, bomberId) ?? DEFAULT_OUTLINE_COLOR;
      const transform: TransformLike = {
        parent: torsoId,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      };
      world.setComponent(outlineId, TRANSFORM, transform);
      world.setComponent(outlineId, MESH_RENDERER, {
        mesh: torsoMesh.mesh,
        color,
        depthFunc: "greater",
        depthWrite: false,
        transparent: true,
        opacity: OUTLINE_OPACITY,
        polygonOffset: OUTLINE_POLYGON_OFFSET
      });
      seen.add(bomberId);
    }
  };

  return { name, fixedUpdate };
}
