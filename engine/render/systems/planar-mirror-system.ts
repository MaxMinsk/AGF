// S59 REFLECTION-planar.
//
// For each entity with a `PlanarMirror` component, the system:
//   1. Acquires a three.js `Reflector` mesh on the adapter (once).
//   2. Positions / orients / scales it each frame from the entity's
//      LocalToWorld.
//   3. Disposes the Reflector when its entity disappears.
//
// Reflector is a self-contained mesh that internally renders the scene
// reflected across its plane each frame; no per-frame system hook is
// needed beyond the transform sync. Three.js handles the inverse-view
// matrix + clipping plane in the Reflector's onBeforeRender callback.

import type { EntityId } from "../../core/ecs/types";
import type { World, QueryHandle } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { ThreeRenderAdapter } from "../three-render-adapter";

export const PLANAR_MIRROR = "PlanarMirror";
const LOCAL_TO_WORLD = "LocalToWorld";

type PlanarMirrorComponent = {
  width?: number;
  height?: number;
  resolution?: 256 | 512 | 1024 | 2048;
  color?: string;
};

type LocalToWorld = {
  position: readonly number[];
  rotation: readonly number[];
  scale: readonly number[];
};

type MirrorState = {
  handle: number;
  width: number;
  height: number;
  resolution: 256 | 512 | 1024 | 2048;
  color: string;
};

export type PlanarMirrorDeps = {
  adapter: ThreeRenderAdapter;
};

export function createPlanarMirrorSystem(deps: PlanarMirrorDeps): System {
  let cachedWorld: World | undefined;
  let mirrorQuery: QueryHandle | undefined;
  const mirrors = new Map<EntityId, MirrorState>();

  return {
    name: "render.planar-mirror",
    frameUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        mirrorQuery = world.createQuery([PLANAR_MIRROR, LOCAL_TO_WORLD]);
        cachedWorld = world;
        mirrors.clear();
      }
      const seen = new Set<EntityId>();
      for (const id of mirrorQuery!.run()) {
        seen.add(id);
        const cfg = world.getComponent<PlanarMirrorComponent>(id, PLANAR_MIRROR);
        if (cfg === undefined) continue;
        const width = cfg.width ?? 10;
        const height = cfg.height ?? 10;
        const resolution = cfg.resolution ?? 512;
        const color = cfg.color ?? "#88aaff";
        let state = mirrors.get(id);
        if (state === undefined) {
          const handle = deps.adapter.acquirePlanarMirror({ width, height, resolution, color });
          state = { handle, width, height, resolution, color };
          mirrors.set(id, state);
        } else if (
          state.width !== width ||
          state.height !== height ||
          state.resolution !== resolution ||
          state.color !== color
        ) {
          // Re-acquire on shape / resolution / colour change. Reflector
          // doesn't expose mutators for these.
          deps.adapter.releasePlanarMirror(state.handle);
          state.handle = deps.adapter.acquirePlanarMirror({ width, height, resolution, color });
          state.width = width;
          state.height = height;
          state.resolution = resolution;
          state.color = color;
        }
        const ltw = world.getComponent<LocalToWorld>(id, LOCAL_TO_WORLD);
        if (ltw !== undefined) {
          deps.adapter.setPlanarMirrorTransform(state.handle, ltw);
        }
      }
      for (const [id, state] of mirrors) {
        if (!seen.has(id)) {
          deps.adapter.releasePlanarMirror(state.handle);
          mirrors.delete(id);
        }
      }
    }
  };
}
