// M21-b: pull hierarchy resolve out of `ThreeRenderer` into a
// scheduler-registered System. The system writes a `LocalToWorld`
// component per Transform-bearing entity (radians; matches Three.js's
// internal convention). Downstream renderer systems (M21-c..f) and any
// gameplay code that wants resolved world transforms read this component.
//
// Caching, two layers (M16-cache-a + M16-cache-b):
//
//   - M16-cache-a: `createHierarchyCache` partial-walk + dirty-revision
//     reuse of `ResolvedTransform` references.
//
//   - M16-cache-b (this system): an internal `inputCache` keeps the
//     deg→rad-converted TransformInput for every known entity across
//     frames. Each tick consumes the World's incremental dirty queue
//     (`world.consumeDirty("Transform")`) and rebuilds inputs ONLY for
//     entities that changed. Replaces the per-frame `world.entityIds()`
//     scan; steady-state per-system cost becomes O(dirty), not O(N).

import { MathUtils } from "three";

import type { EntityId } from "../../core/ecs/types";
import type { System, SystemContext } from "../../core/systems/types";
import {
  createHierarchyCache,
  type HierarchyCache
} from "../../core/transform/resolve-cached";
import type { TransformInput } from "../../core/transform/resolve";

export const LOCAL_TO_WORLD: string = "LocalToWorld";
export const TRANSFORM: string = "Transform";

export type LocalToWorld = {
  /** World-space position (resolver math; not transformed). */
  position: readonly [number, number, number];
  /** World-space rotation in **radians** (resolver convention; matches Three.js). */
  rotation: readonly [number, number, number];
  /** World-space scale. */
  scale: readonly [number, number, number];
};

type TransformComponent = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: EntityId;
};

export type TransformResolveSystemOptions = {
  name?: string;
};

export type TransformResolveSystemHandle = System & {
  /** Drop the cached resolver state. Use after HMR or scene swaps where cached identity could mislead consumers. */
  clearCache(): void;
  /** Per-frame stats from the most recent resolve. */
  stats(): ReturnType<HierarchyCache["stats"]>;
};

/**
 * Build a `frameUpdate` System that walks every entity carrying `Transform`,
 * resolves the hierarchy via `createHierarchyCache`, and writes a
 * `LocalToWorld` component back to the World. The deg→rad conversion that
 * used to live in `ThreeRenderer.buildResolvedTransforms` is now this
 * system's responsibility — scene authoring keeps degrees, every downstream
 * reader gets radians.
 */
export function createTransformResolveSystem(
  options: TransformResolveSystemOptions = {}
): TransformResolveSystemHandle {
  const cache = createHierarchyCache();
  const name = options.name ?? "render.transform-resolve";
  // M16-cache-b: per-system input cache. Built incrementally from
  // `world.consumeDirty("Transform")`. Holds the deg→rad-converted
  // TransformInput so we never repeat the conversion for unchanged entities.
  const inputCache = new Map<EntityId, TransformInput>();
  let cachedWorld: import("../../core/ecs/world").World | undefined;

  const buildInput = (id: EntityId, t: TransformComponent): TransformInput => {
    const entry: TransformInput = { id };
    if (t.parent !== undefined) entry.parent = t.parent;
    if (t.position !== undefined) {
      entry.position = [t.position[0] ?? 0, t.position[1] ?? 0, t.position[2] ?? 0];
    }
    if (t.rotation !== undefined) {
      // Authoring convention: degrees. Resolver + Three.js convention: radians.
      entry.rotation = [
        MathUtils.degToRad(t.rotation[0] ?? 0),
        MathUtils.degToRad(t.rotation[1] ?? 0),
        MathUtils.degToRad(t.rotation[2] ?? 0)
      ];
    }
    if (t.scale !== undefined) {
      entry.scale = [t.scale[0] ?? 1, t.scale[1] ?? 1, t.scale[2] ?? 1];
    }
    return entry;
  };

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    let dirty: Set<EntityId>;
    if (world !== cachedWorld) {
      // World swapped (HMR / project switch). Drop everything and re-seed
      // from a full scan so the inputCache matches the new world's state.
      inputCache.clear();
      cache.clear();
      dirty = new Set();
      for (const id of world.entityIds()) {
        if (!world.hasComponent(id, TRANSFORM)) continue;
        const t = world.getComponent<TransformComponent>(id, TRANSFORM);
        if (t === undefined) continue;
        inputCache.set(id, buildInput(id, t));
        dirty.add(id);
      }
      // Drain the dirty queue so we don't reprocess the seed entries on the next tick.
      world.consumeDirty(TRANSFORM);
      cachedWorld = world;
    } else {
      // Steady state: process only entities whose Transform changed since
      // the previous tick.
      dirty = world.consumeDirty(TRANSFORM);
      for (const id of dirty) {
        const t = world.getComponent<TransformComponent>(id, TRANSFORM);
        if (t === undefined) {
          // Transform removed (or the whole entity dropped). Evict +
          // remove the matching LocalToWorld so downstream readers don't
          // lock onto a stale value.
          inputCache.delete(id);
          if (world.hasComponent(id, LOCAL_TO_WORLD)) {
            world.removeComponent(id, LOCAL_TO_WORLD);
          }
          continue;
        }
        inputCache.set(id, buildInput(id, t));
      }
    }

    let resolved;
    try {
      // M16-cache-c: skip the cache's O(N) per-entity revision read; the
      // dirty set we just consumed is authoritative.
      resolved = cache.resolveWithDirty(world, [...inputCache.values()], dirty);
    } catch {
      // Renderer-import-boundary: engine check owns hierarchy diagnostics.
      // Mid-edit HMR can produce a transient broken hierarchy; swallow it
      // and skip the write this frame so we don't crash the render loop.
      return;
    }

    // Write LocalToWorld for every entity present this frame. The cache's
    // partial-walk path returns the same `ResolvedTransform` reference for
    // entities that didn't change → we still need to set the component
    // (cheap idempotent path) so newly-mounted readers see it.
    for (const [id, value] of resolved) {
      const ltw: LocalToWorld = {
        position: value.world.position,
        rotation: value.world.rotation,
        scale: value.world.scale
      };
      world.setComponent(id, LOCAL_TO_WORLD, ltw as unknown as Record<string, unknown>);
    }
  };

  return {
    name,
    frameUpdate,
    clearCache(): void {
      cache.clear();
      inputCache.clear();
      cachedWorld = undefined;
    },
    stats(): ReturnType<HierarchyCache["stats"]> {
      return cache.stats();
    }
  };
}
