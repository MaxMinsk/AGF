// S57 REFLECTION-cube-probe.
//
// For each entity with a `ReflectionProbe` component, the system:
//   1. Acquires a CubeCamera + WebGLCubeRenderTarget on the adapter (once).
//   2. Each frame, depending on the configured cadence, hides the
//      excluded entities, calls `cubeCam.update(renderer, scene)`, then
//      restores visibility.
//   3. Stamps the resulting cube texture onto every entity referencing
//      this probe via `EnvmapBinding { probe: <probe-entity-id> }`.
//
// Runs before the main render. The probe owner is implicitly excluded
// in addition to anything the user listed.

import type { EntityId } from "../../core/ecs/types";
import type { World, QueryHandle } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { Texture } from "three";
import type { MeshHandleRegistry } from "../mesh-handle-registry";
import type { ThreeRenderAdapter } from "../three-render-adapter";

export const REFLECTION_PROBE: string = "ReflectionProbe";
export const ENVMAP_BINDING: string = "EnvmapBinding";
const LOCAL_TO_WORLD = "LocalToWorld";

type ReflectionProbeComponent = {
  size?: 128 | 256 | 512;
  near?: number;
  far?: number;
  updateRate?: 0 | 15 | 30 | 60;
  excludeEntities?: ReadonlyArray<string>;
};

type EnvmapBindingComponent = {
  probe: string;
  intensity?: number;
};

type ProbeState = {
  handle: number;
  size: 128 | 256 | 512;
  updateRate: 0 | 15 | 30 | 60;
  excludeEntities: ReadonlyArray<string>;
  /** seconds since last update; gates the per-frame `cubeCam.update`. */
  accumSeconds: number;
  /** Once == true, the bake-once mode (updateRate=0) stops calling update. */
  baked: boolean;
};

export type ReflectionProbeDeps = {
  adapter: ThreeRenderAdapter;
  registry: MeshHandleRegistry;
};

export function createReflectionProbeSystem(deps: ReflectionProbeDeps): System {
  let cachedWorld: World | undefined;
  let probeQuery: QueryHandle | undefined;
  let bindingQuery: QueryHandle | undefined;
  const probes = new Map<EntityId, ProbeState>();

  const fixedDtForRate = (rate: 0 | 15 | 30 | 60): number =>
    rate === 0 ? Number.POSITIVE_INFINITY : 1 / rate;

  return {
    name: "render.reflection-probe",
    frameUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        probeQuery = world.createQuery([REFLECTION_PROBE, LOCAL_TO_WORLD]);
        bindingQuery = world.createQuery([ENVMAP_BINDING]);
        cachedWorld = world;
        probes.clear();
      }

      // 1. Acquire / update / dispose probe entries.
      const seen = new Set<EntityId>();
      for (const id of probeQuery!.run()) {
        seen.add(id);
        const config = world.getComponent<ReflectionProbeComponent>(id, REFLECTION_PROBE);
        if (config === undefined) continue;
        const size = config.size ?? 256;
        const updateRate = config.updateRate ?? 60;
        const excludeEntities = config.excludeEntities ?? [];
        let state = probes.get(id);
        if (state === undefined) {
          const handle = deps.adapter.acquireReflectionProbe({
            size,
            near: config.near ?? 0.1,
            far: config.far ?? 1000
          });
          state = {
            handle,
            size,
            updateRate,
            excludeEntities,
            accumSeconds: 0,
            baked: false
          };
          probes.set(id, state);
        } else if (state.size !== size || state.updateRate !== updateRate) {
          // Re-acquire if size changed; otherwise just update cadence.
          if (state.size !== size) {
            deps.adapter.releaseReflectionProbe(state.handle);
            state.handle = deps.adapter.acquireReflectionProbe({
              size,
              near: config.near ?? 0.1,
              far: config.far ?? 1000
            });
            state.size = size;
            state.baked = false;
          }
          state.updateRate = updateRate;
          state.excludeEntities = excludeEntities;
        }

        // Position the probe at the entity's resolved world position.
        const ltw = world.getComponent<{ position?: readonly number[] }>(id, LOCAL_TO_WORLD);
        const pos = ltw?.position;
        if (pos !== undefined && pos.length >= 3) {
          deps.adapter.setReflectionProbeTransform(state.handle, [pos[0]!, pos[1]!, pos[2]!]);
        }

        // Cadence gate.
        state.accumSeconds += context.time.dt;
        const interval = fixedDtForRate(state.updateRate);
        const shouldUpdate =
          state.updateRate === 0
            ? !state.baked
            : state.accumSeconds >= interval;
        if (shouldUpdate) {
          state.accumSeconds = 0;
          const hidden: Array<import("three").Object3D> = [];
          const excludes = new Set<EntityId>(excludeEntities);
          excludes.add(id); // never see self.
          for (const excludeId of excludes) {
            const meshHandle = deps.registry.handleFor(excludeId);
            if (meshHandle === undefined) continue;
            const mesh = deps.adapter.meshForHandle(meshHandle);
            if (mesh !== undefined) hidden.push(mesh);
          }
          deps.adapter.updateReflectionProbe(state.handle, hidden);
          if (state.updateRate === 0) state.baked = true;
        }
      }

      // Drop probes whose entities disappeared.
      for (const [id, state] of probes) {
        if (!seen.has(id)) {
          deps.adapter.releaseReflectionProbe(state.handle);
          probes.delete(id);
        }
      }

      // 2. Stamp the probe texture onto every entity with an EnvmapBinding.
      // Re-binds every frame; cheap because MaterialBinding handles the
      // setMeshMaterialPatch idempotently.
      for (const bindingId of bindingQuery!.run()) {
        const binding = world.getComponent<EnvmapBindingComponent>(bindingId, ENVMAP_BINDING);
        if (binding === undefined) continue;
        const probeState = probes.get(binding.probe);
        if (probeState === undefined) continue;
        const texture: Texture | undefined = deps.adapter.reflectionProbeTexture(probeState.handle);
        if (texture === undefined) continue;
        const meshHandle = deps.registry.handleFor(bindingId);
        if (meshHandle === undefined) continue;
        deps.adapter.setMeshMaterialPatch(meshHandle, {
          envMap: texture,
          ...(binding.intensity !== undefined ? { envMapIntensity: binding.intensity } : {})
        });
      }
    }
  };
}
