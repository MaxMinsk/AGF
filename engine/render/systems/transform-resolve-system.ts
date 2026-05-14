// M21-b: pull hierarchy resolve out of `ThreeRenderer` into a
// scheduler-registered System. The system writes a `LocalToWorld`
// component per Transform-bearing entity (radians; matches Three.js's
// internal convention). Downstream renderer systems (M21-c..f) and any
// gameplay code that wants resolved world transforms read this component.
//
// The cache lives across frames inside the closure — `M16-cache-a`
// partial-walk caching cuts the steady-state cost ~2.4× and the 1%-dirty
// cost ~1.6× compared to the no-cache path. See
// `docs/research/ecs-benchmarks-baseline.json` for current numbers.

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

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    const inputs: TransformInput[] = [];
    const presentIds = new Set<EntityId>();

    for (const id of world.entityIds()) {
      if (!world.hasComponent(id, TRANSFORM)) continue;
      const t = world.getComponent<TransformComponent>(id, TRANSFORM);
      if (t === undefined) continue;
      presentIds.add(id);
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
      inputs.push(entry);
    }

    let resolved;
    try {
      resolved = cache.resolveWorld(world, inputs);
    } catch {
      // Renderer-import-boundary: engine check owns hierarchy diagnostics.
      // Mid-edit HMR can produce a transient broken hierarchy; swallow it
      // and skip the write this frame so we don't crash the render loop.
      return;
    }

    // Write LocalToWorld for every entity present this frame.
    for (const [id, value] of resolved) {
      const ltw: LocalToWorld = {
        position: value.world.position,
        rotation: value.world.rotation,
        scale: value.world.scale
      };
      world.setComponent(id, LOCAL_TO_WORLD, ltw as unknown as Record<string, unknown>);
    }

    // Evict stale LocalToWorld entries for entities that no longer carry
    // Transform. Without this they linger and mislead downstream readers.
    for (const id of world.query([LOCAL_TO_WORLD])) {
      if (!presentIds.has(id)) {
        world.removeComponent(id, LOCAL_TO_WORLD);
      }
    }
  };

  return {
    name,
    frameUpdate,
    clearCache(): void {
      cache.clear();
    },
    stats(): ReturnType<HierarchyCache["stats"]> {
      return cache.stats();
    }
  };
}
