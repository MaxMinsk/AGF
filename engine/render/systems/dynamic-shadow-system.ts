// S52 M21-shadow-static-caster-tag.
//
// When a scene marks at least one entity as `ShadowCaster { dynamic: true }`,
// this system:
//
//   1. Flips `renderer.shadowMap.autoUpdate = false` on the adapter so
//      the per-frame "rebuild every cascade unconditionally" pass is
//      suppressed.
//   2. Caches the last-written `LocalToWorld` of every dynamic-tagged
//      entity. Each frame, walks the set; if any entry differs from
//      the cache (position OR rotation OR scale, beyond a small epsilon),
//      calls `adapter.invalidateShadowMap()` so three.js bakes once
//      this frame.
//
// Entities without `ShadowCaster` (or `ShadowCaster { dynamic: false }`)
// are treated as static — they contribute to the initial bake but don't
// trigger re-bakes when their LTW moves. Scenes without ANY dynamic-
// tagged ShadowCaster fall through entirely: the system is a no-op and
// `shadowMap.autoUpdate` stays at its default.
//
// Limitations (S52 v0):
//   - Invalidates the WHOLE shadow map (every cascade) on any dynamic
//     caster movement. Three.js CSM doesn't expose per-cascade
//     invalidation, so a single moving caster forces every cascade to
//     re-bake. Per-cascade dirty tracking is a follow-up.
//   - When every dynamic caster moves every frame (e.g. shadows-bench
//     cars on continuous WaypointMover paths), the system trades the
//     unconditional `autoUpdate=true` re-bake for a conditional one
//     that still fires every frame — no measurable win. The intended
//     audience is scenes where dynamic casters are IDLE most of the
//     time (e.g. beacon-world player drone, NPCs at rest).

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { ThreeRenderAdapter } from "../three-render-adapter";

export const SHADOW_CASTER: ComponentName = "ShadowCaster";
export const LOCAL_TO_WORLD: ComponentName = "LocalToWorld";

type ShadowCasterComponent = { dynamic?: boolean };
type LocalToWorldComponent = {
  position: ReadonlyArray<number>;
  rotation: ReadonlyArray<number>;
  scale: ReadonlyArray<number>;
};

const EPSILON = 1e-5;

export type DynamicShadowDeps = {
  adapter: ThreeRenderAdapter;
};

export function createDynamicShadowSystem(
  deps: DynamicShadowDeps,
  options: { name?: string } = {}
): System {
  const name = options.name ?? "render.dynamic-shadow";
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;
  let autoUpdateDisabled = false;
  const lastWorld = new Map<EntityId, [number, number, number, number, number, number, number, number, number]>();

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      query = world.createQuery([SHADOW_CASTER, LOCAL_TO_WORLD]);
      cachedWorld = world;
      autoUpdateDisabled = false;
      lastWorld.clear();
    }
    const handle = query;
    if (handle === undefined) return;

    // Collect tagged-dynamic entities. We re-scan each frame because
    // the tag set is small (the whole point of this system) and the
    // overhead is negligible vs the shadow-pass cost we're trying to
    // avoid.
    let sawDynamic = false;
    let dirty = false;
    const liveIds = new Set<EntityId>();
    for (const id of handle.run()) {
      const tag = world.getComponent<ShadowCasterComponent>(id, SHADOW_CASTER);
      if (tag?.dynamic !== true) continue;
      sawDynamic = true;
      liveIds.add(id);
      const ltw = world.getComponent<LocalToWorldComponent>(id, LOCAL_TO_WORLD);
      if (ltw === undefined) continue;
      const prev = lastWorld.get(id);
      const next: [number, number, number, number, number, number, number, number, number] = [
        ltw.position[0] ?? 0, ltw.position[1] ?? 0, ltw.position[2] ?? 0,
        ltw.rotation[0] ?? 0, ltw.rotation[1] ?? 0, ltw.rotation[2] ?? 0,
        ltw.scale[0] ?? 1, ltw.scale[1] ?? 1, ltw.scale[2] ?? 1
      ];
      if (prev === undefined) {
        // First sighting → counts as dirty so the initial bake happens
        // even after we flip autoUpdate off below.
        dirty = true;
        lastWorld.set(id, next);
        continue;
      }
      for (let i = 0; i < 9; i++) {
        if (Math.abs(prev[i]! - next[i]!) > EPSILON) {
          dirty = true;
          break;
        }
      }
      if (dirty) lastWorld.set(id, next);
    }

    // Garbage-collect entries for entities that lost their tag or got
    // deleted. Important because LTW caches grow unbounded otherwise.
    if (lastWorld.size > liveIds.size) {
      for (const id of lastWorld.keys()) {
        if (!liveIds.has(id)) lastWorld.delete(id);
      }
    }

    if (!sawDynamic) {
      // Scene has no dynamic-tagged casters — leave autoUpdate alone.
      // If we previously disabled it (e.g. tags removed at runtime),
      // restore the default so static-only behaviour doesn't get stuck.
      if (autoUpdateDisabled) {
        deps.adapter.setShadowMapAutoUpdate(true);
        autoUpdateDisabled = false;
      }
      return;
    }

    if (!autoUpdateDisabled) {
      deps.adapter.setShadowMapAutoUpdate(false);
      autoUpdateDisabled = true;
      // setShadowMapAutoUpdate(false) already triggers one final bake.
      // We still mark dirty below if any caster moved, so the cache
      // stays current.
    }

    if (dirty) {
      deps.adapter.invalidateShadowMap();
    }
  };

  return {
    name,
    frameUpdate
  };
}
