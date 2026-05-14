// LocalToWorld cache for the hierarchy resolver (M16-cache-a).
//
// The non-cached `resolveHierarchy` rebuilds every entity's local + world
// transform from scratch every frame — measured at ~12 ms on chain-of-8 at
// 10k entities (see docs/research/ecs-benchmarks-baseline.json). That number
// is the reason this cache exists.
//
// Cache strategy:
//   - Pair each cached entry with the World's per-component revision counter
//     (`world.componentRevision(id, "Transform")`). A bumped revision means
//     the Transform was overwritten; cached local + world are invalid.
//   - Propagate "dirty" down the parent chain: if a parent's local changed,
//     every transitive child's world needs re-composition even if the
//     children's own locals are unchanged.
//   - Reuse the `ResolvedTransform` object reference when nothing changed.
//     Downstream consumers can use referential equality as a "did this
//     entity move this frame?" check, no allocations.
//
// Per `Notes/ecs_notes.md`, this matches the Unity DOTS TransformSystemGroup
// LocalToWorld + parent-revision approach, scaled down to V8 / Maps.

import type { ComponentName, EntityId } from "../ecs/types";
import type { World } from "../ecs/world";
import {
  composeWorld,
  resolveHierarchy,
  type LocalTransform,
  type ResolvedTransform,
  type TransformInput,
  type Vec3,
  type WorldTransform
} from "./resolve";

type CachedEntry = {
  /** Last value of `world.componentRevision(id, "Transform")` we saw. */
  transformRevision: number;
  /** Resolved world transform from the previous frame. */
  resolved: ResolvedTransform;
};

const ZERO_VEC: Vec3 = [0, 0, 0];
const ONE_VEC: Vec3 = [1, 1, 1];

export type HierarchyCacheStats = {
  /** Total entities seen this resolve. */
  total: number;
  /** Entities whose Transform changed (or whose ancestor changed) and were re-resolved. */
  dirty: number;
  /** Entities whose cached entry was reused without re-composition. */
  reused: number;
  /** Entities removed from the cache because they no longer have Transform. */
  evicted: number;
};

export type HierarchyCache = {
  /**
   * Resolve world transforms for every entity carrying `Transform` in the
   * World. Returns the same shape as `resolveHierarchy` but skips
   * re-composition for unchanged subtrees.
   *
   * Callers that need to pre-process inputs (e.g. convert
   * `Transform.rotation` from degrees to radians, as the renderer's
   * `TransformResolveSystem` does) pass their own `inputs` array. The
   * cache still keys revision-tracking off `world.componentRevision(id,
   * "Transform")` so the dirty-detection works the same regardless of who
   * built the input.
   */
  resolveWorld(world: World, inputs?: ReadonlyArray<TransformInput>): Map<EntityId, ResolvedTransform>;
  /**
   * Drop the cache. Use after schema-shape changes or HMR reloads where
   * cached `ResolvedTransform` references would mislead downstream identity
   * checks.
   */
  clear(): void;
  /** Per-resolve stats from the most recent call. Helpful for benches + diagnostics. */
  stats(): HierarchyCacheStats;
  /** Number of entries currently cached. Exposed for tests + diagnostics. */
  size(): number;
};

const TRANSFORM: ComponentName = "Transform";

export function createHierarchyCache(): HierarchyCache {
  const cache = new Map<EntityId, CachedEntry>();
  let lastStats: HierarchyCacheStats = { total: 0, dirty: 0, reused: 0, evicted: 0 };

  return {
    resolveWorld(world: World, providedInputs?: ReadonlyArray<TransformInput>): Map<EntityId, ResolvedTransform> {
      const present = new Set<EntityId>();
      const inputs: TransformInput[] = [];
      const liveRevisions = new Map<EntityId, number>();
      if (providedInputs !== undefined) {
        for (const entry of providedInputs) {
          present.add(entry.id);
          liveRevisions.set(entry.id, world.componentRevision(entry.id, TRANSFORM));
          inputs.push(entry);
        }
      } else {
        for (const id of world.entityIds()) {
          if (!world.hasComponent(id, TRANSFORM)) continue;
          present.add(id);
          liveRevisions.set(id, world.componentRevision(id, TRANSFORM));
          const t = world.getComponent<{
            position?: Vec3;
            rotation?: Vec3;
            scale?: Vec3;
            parent?: EntityId;
          }>(id, TRANSFORM);
          if (t === undefined) continue;
          const entry: TransformInput = { id };
          if (t.parent !== undefined) entry.parent = t.parent;
          if (t.position !== undefined) entry.position = t.position;
          if (t.rotation !== undefined) entry.rotation = t.rotation;
          if (t.scale !== undefined) entry.scale = t.scale;
          inputs.push(entry);
        }
      }

      // Evict entries for entities that no longer carry Transform.
      let evicted = 0;
      for (const id of cache.keys()) {
        if (!present.has(id)) {
          cache.delete(id);
          evicted += 1;
        }
      }

      // First pass: figure out which entities' locals changed. Then propagate
      // dirty marks down the parent chain so subtrees with an unchanged child
      // but a moved ancestor still re-resolve.
      const dirty = new Set<EntityId>();
      const parentOf = new Map<EntityId, EntityId | undefined>();
      for (const input of inputs) {
        parentOf.set(input.id, input.parent);
        const previous = cache.get(input.id);
        const liveRev = liveRevisions.get(input.id) ?? 0;
        if (previous === undefined || previous.transformRevision !== liveRev) {
          dirty.add(input.id);
        }
      }
      // Propagate: any child of a dirty entity is itself dirty.
      // One bottom-up walk per input; cycles already rejected by `resolveHierarchy`.
      const ancestorDirty = (id: EntityId): boolean => {
        let cursor: EntityId | undefined = id;
        while (cursor !== undefined) {
          if (dirty.has(cursor)) return true;
          cursor = parentOf.get(cursor);
        }
        return false;
      };
      for (const input of inputs) {
        if (!dirty.has(input.id) && ancestorDirty(input.id)) {
          dirty.add(input.id);
        }
      }

      // Fast path: no dirty entries → every entity is fresh, reuse all cached
      // ResolvedTransforms. This is the common steady-state case.
      if (dirty.size === 0) {
        const result = new Map<EntityId, ResolvedTransform>();
        for (const input of inputs) {
          const previous = cache.get(input.id);
          if (previous !== undefined) {
            result.set(input.id, previous.resolved);
          }
        }
        lastStats = { total: inputs.length, dirty: 0, reused: result.size, evicted };
        return result;
      }

      // Mixed path: partial walk. Topologically sort the inputs (parents
      // before children), then for each entity decide:
      //   - clean + cached → reuse the cached ResolvedTransform reference.
      //   - dirty (or never cached) → compose afresh from parent's world.
      // This skips the expensive matrix compose/decompose math on every
      // entity that didn't change this frame. First-time inputs without a
      // cache entry fall through `resolveHierarchy` for the initial walk
      // because the parent links + cycle detection are well-tested there.
      const inputById = new Map<EntityId, TransformInput>();
      for (const input of inputs) inputById.set(input.id, input);

      const order: EntityId[] = [];
      const visited = new Set<EntityId>();
      const visit = (id: EntityId): void => {
        if (visited.has(id)) return;
        visited.add(id);
        const node = inputById.get(id);
        if (node === undefined) return;
        if (node.parent !== undefined) visit(node.parent);
        order.push(id);
      };
      for (const input of inputs) visit(input.id);

      const result = new Map<EntityId, ResolvedTransform>();
      let reused = 0;
      let needsFallback = false;
      for (const id of order) {
        const input = inputById.get(id);
        if (input === undefined) continue;
        const previous = cache.get(id);
        if (!dirty.has(id) && previous !== undefined) {
          result.set(id, previous.resolved);
          reused += 1;
          continue;
        }
        const local: LocalTransform = {
          position: input.position ?? ZERO_VEC,
          rotation: input.rotation ?? ZERO_VEC,
          scale: input.scale ?? ONE_VEC
        };
        let world: WorldTransform = local;
        if (input.parent !== undefined) {
          const parentResolved = result.get(input.parent);
          if (parentResolved === undefined) {
            // Parent missing from `result` — either it lacks Transform or the
            // topo walk broke. Fall back to the canonical resolver below.
            needsFallback = true;
            break;
          }
          world = composeWorld(parentResolved.world, local);
        }
        const resolved: ResolvedTransform = { parent: input.parent, local, world };
        result.set(id, resolved);
        cache.set(id, {
          transformRevision: liveRevisions.get(id) ?? 0,
          resolved
        });
      }

      if (needsFallback) {
        // Safety net for inputs the partial walk can't resolve (e.g. parent
        // outside the Transform set). `resolveHierarchy` has the full cycle
        // + missing-parent guards; reuse them. Cost: one full rebuild for
        // this frame only — next frame can return to the cached path.
        result.clear();
        const fresh = resolveHierarchy(inputs);
        for (const input of inputs) {
          const id = input.id;
          const resolved = fresh.get(id);
          if (resolved === undefined) continue;
          result.set(id, resolved);
          cache.set(id, {
            transformRevision: liveRevisions.get(id) ?? 0,
            resolved
          });
        }
        reused = 0;
      }

      lastStats = {
        total: inputs.length,
        dirty: dirty.size,
        reused,
        evicted
      };
      return result;
    },
    clear(): void {
      cache.clear();
      lastStats = { total: 0, dirty: 0, reused: 0, evicted: 0 };
    },
    stats(): HierarchyCacheStats {
      return lastStats;
    },
    size(): number {
      return cache.size;
    }
  };
}
