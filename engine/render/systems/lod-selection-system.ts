// M17-lod: per-entity LOD chain selection.
//
// For every entity carrying an `LOD` component plus a `Transform` and
// a `MeshRenderer`, the system measures the squared distance from the
// active camera's world position to the entity, picks the lowest
// `maxDistance` level whose threshold the entity is inside, and
// updates `MeshRenderer.mesh` (+ optional `material` / `color`) when
// the chosen level differs from the entity's last applied level.
//
// **S53 M17-lod-batched.** When the entity is on the `batched` or
// `batched-bvh` path, an LOD swap stays within the bucket: the
// downstream `BatchingSystem.updateBatched` flow detects the mesh-ref
// change, adds the new geometry to the same bucket (if not already
// present), and calls `setBatchedInstanceGeometry` to repoint the
// instance's geometryId without releasing the slot. Coverage in
// `tests/unit/batching-system-batched-path.test.ts`. The `instanced`
// path still releases + re-acquires (one InstancedMesh owns one
// geometry).
//
// Past the last threshold:
//   - `fallback: "last"` (default) keeps the cheapest mesh on screen.
//   - `fallback: "hide"` deletes MeshRenderer so MeshLifecycleSystem
//     releases the GPU resource until the camera approaches again. A
//     runtime-only `LodHidden` component tracks the previous renderer
//     so we can restore it once the entity comes back into range.
//
// Levels must be sorted by `maxDistance` ascending in the scene
// authoring; the system does NOT re-sort at runtime — `engine check`
// catches out-of-order entries.

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";

export const LOD: ComponentName = "LOD";
export const TRANSFORM: ComponentName = "Transform";
export const MESH_RENDERER: ComponentName = "MeshRenderer";
export const ACTIVE_CAMERA: ComponentName = "ActiveCamera";
export const LOCAL_TO_WORLD: ComponentName = "LocalToWorld";
export const LOD_HIDDEN: ComponentName = "LodHidden";

type Vec3 = ReadonlyArray<number>;

type TransformComponent = { position?: Vec3 };
type LocalToWorldComponent = { position: Vec3 };
type MeshRendererComponent = { mesh: string; material?: string; color?: string };
type LodLevel = {
  maxDistance: number;
  mesh: string;
  material?: string;
  color?: string;
};
type LodComponent = {
  levels: ReadonlyArray<LodLevel>;
  fallback?: "last" | "hide";
};
type LodHiddenComponent = { restore: MeshRendererComponent };

export type LodSelectionSystemHandle = System;

export function createLodSelectionSystem(
  options: { name?: string } = {}
): LodSelectionSystemHandle {
  const name = options.name ?? "render.lod-selection";
  let cachedWorld: World | undefined;
  let lodQuery: QueryHandle | undefined;
  let cameraQuery: QueryHandle | undefined;
  // Remember the level index we last applied to each entity so the
  // system stays a no-op when nothing crossed a threshold this frame.
  // -1 = currently hidden via fallback:"hide".
  const lastLevel = new Map<EntityId, number>();

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      lodQuery = world.createQuery([LOD, TRANSFORM]);
      cameraQuery = world.createQuery([ACTIVE_CAMERA, TRANSFORM]);
      cachedWorld = world;
      lastLevel.clear();
    }
    const cameraIds = cameraQuery!.run();
    const cameraId = cameraIds[0];
    if (cameraId === undefined) return;
    // Prefer the resolved LocalToWorld (post-hierarchy) for accuracy;
    // fall back to Transform when no scheduler wrote LocalToWorld yet.
    const cameraLtw = world.getComponent<LocalToWorldComponent>(cameraId, LOCAL_TO_WORLD);
    const cameraTransform = world.getComponent<TransformComponent>(cameraId, TRANSFORM);
    const cameraPos: Vec3 =
      cameraLtw?.position ?? cameraTransform?.position ?? [0, 0, 0];
    const cx = cameraPos[0] ?? 0;
    const cy = cameraPos[1] ?? 0;
    const cz = cameraPos[2] ?? 0;

    for (const entityId of lodQuery!.run()) {
      const lod = world.getComponent<LodComponent>(entityId, LOD);
      if (lod === undefined || lod.levels.length === 0) continue;
      const ltw = world.getComponent<LocalToWorldComponent>(entityId, LOCAL_TO_WORLD);
      const transform = world.getComponent<TransformComponent>(entityId, TRANSFORM);
      const pos = ltw?.position ?? transform?.position ?? [0, 0, 0];
      const dx = (pos[0] ?? 0) - cx;
      const dy = (pos[1] ?? 0) - cy;
      const dz = (pos[2] ?? 0) - cz;
      const distSq = dx * dx + dy * dy + dz * dz;

      let chosen = -1;
      for (let i = 0; i < lod.levels.length; i += 1) {
        const lvl = lod.levels[i];
        if (lvl === undefined) continue;
        if (distSq <= lvl.maxDistance * lvl.maxDistance) {
          chosen = i;
          break;
        }
      }

      const previous = lastLevel.get(entityId);
      if (chosen === -1) {
        // Past the last threshold.
        if ((lod.fallback ?? "last") === "hide") {
          if (previous !== -1) {
            // Stash the current renderer so we can restore it later.
            const existing = world.getComponent<MeshRendererComponent>(entityId, MESH_RENDERER);
            if (existing !== undefined) {
              world.setComponent(entityId, LOD_HIDDEN, {
                restore: { ...existing }
              } satisfies LodHiddenComponent);
              world.removeComponent(entityId, MESH_RENDERER);
            }
            lastLevel.set(entityId, -1);
          }
          continue;
        }
        // fallback === "last" — pin to the cheapest level.
        chosen = lod.levels.length - 1;
      }

      if (previous === chosen) continue;

      // Coming back from hidden — clear the LodHidden marker first.
      if (previous === -1 && world.hasComponent(entityId, LOD_HIDDEN)) {
        world.removeComponent(entityId, LOD_HIDDEN);
      }

      const level = lod.levels[chosen];
      if (level === undefined) continue;
      const next: MeshRendererComponent = { mesh: level.mesh };
      if (level.material !== undefined) next.material = level.material;
      if (level.color !== undefined) next.color = level.color;
      world.setComponent(entityId, MESH_RENDERER, next);
      lastLevel.set(entityId, chosen);
    }
  };

  return { name, frameUpdate };
}
