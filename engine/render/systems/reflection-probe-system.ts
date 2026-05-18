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
  prefilter?: "mipmap" | "pmrem";
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
  prefilter: "mipmap" | "pmrem";
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
  // S71 fix: per-entity memo of "what we already wrote into envMap" so we
  // only call setMeshMaterialPatch on actual change.
  const boundTextureByEntity = new Map<EntityId, Texture>();
  const boundIntensityByEntity = new Map<EntityId, number>();

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
        boundTextureByEntity.clear();
        boundIntensityByEntity.clear();
      }

      // Zero the frame's PMREM-regen accumulator before any probe runs
      // — `rendererInfo().prefilterMs` should reflect only this frame's
      // cost.
      deps.adapter.resetReflectionPrefilterTimings();

      // 1. Acquire / update / dispose probe entries. Collects probes
      //    that WANT to bake this frame; the actual cube-bake fires in
      //    pass 2 with a per-frame budget cap.
      const seen = new Set<EntityId>();
      type PendingBake = { id: EntityId; state: ProbeState; excludes: ReadonlyArray<EntityId>; overdueSeconds: number };
      const pendingBakes: PendingBake[] = [];
      for (const id of probeQuery!.run()) {
        seen.add(id);
        const config = world.getComponent<ReflectionProbeComponent>(id, REFLECTION_PROBE);
        if (config === undefined) continue;
        const size = config.size ?? 256;
        const updateRate = config.updateRate ?? 60;
        const prefilter = config.prefilter ?? "mipmap";
        const excludeEntities = config.excludeEntities ?? [];
        let state = probes.get(id);
        if (state === undefined) {
          const handle = deps.adapter.acquireReflectionProbe({
            size,
            near: config.near ?? 0.1,
            far: config.far ?? 1000,
            prefilter
          });
          state = {
            handle,
            size,
            updateRate,
            prefilter,
            excludeEntities,
            accumSeconds: 0,
            baked: false
          };
          probes.set(id, state);
        } else if (state.size !== size || state.updateRate !== updateRate || state.prefilter !== prefilter) {
          // Re-acquire when size or prefilter mode changed; otherwise just
          // update cadence.
          if (state.size !== size || state.prefilter !== prefilter) {
            deps.adapter.releaseReflectionProbe(state.handle);
            state.handle = deps.adapter.acquireReflectionProbe({
              size,
              near: config.near ?? 0.1,
              far: config.far ?? 1000,
              prefilter
            });
            state.size = size;
            state.prefilter = prefilter;
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
          pendingBakes.push({
            id,
            state,
            excludes: excludeEntities,
            overdueSeconds: state.updateRate === 0 ? Number.POSITIVE_INFINITY : state.accumSeconds - interval
          });
        }
      }

      // S71 WEBGPU-probe-stagger. CubeCamera.update() does 6 full
      // renderer.render() calls. With N probes that all want to bake on
      // the same frame, the per-frame cost spikes to N × 6 cube renders
      // + N × PMREM prefilter — easy to push frameDt above the 8-step
      // accumulator cap on WebGPU (where cube-bakes run 3-4× slower
      // than on WebGL2 in r0.184), at which point fixed-step gameplay
      // stalls and the scene visibly freezes.
      //
      // Round-robin: bake at most one probe per frame. Pick the
      // most-overdue probe so a probe that fell behind catches up
      // first. Bake-once probes (updateRate === 0) have
      // overdueSeconds === Infinity and always win until they've baked.
      //
      // Net effect: per-frame bake cost is capped at 6 cube renders
      // regardless of probe count, while the AVERAGE refresh rate
      // matches the configured updateRate as long as
      // fps >= probeCount * updateRate (e.g., 60 fps comfortably
      // supports 3 probes at 15 Hz = 45 demand/sec with headroom).
      if (pendingBakes.length > 0) {
        let pick = pendingBakes[0]!;
        for (let i = 1; i < pendingBakes.length; i += 1) {
          if (pendingBakes[i]!.overdueSeconds > pick.overdueSeconds) pick = pendingBakes[i]!;
        }
        pick.state.accumSeconds = 0;
        const hidden: Array<import("three").Object3D> = [];
        const excludes = new Set<EntityId>(pick.excludes);
        excludes.add(pick.id); // never see self.
        for (const excludeId of excludes) {
          const meshHandle = deps.registry.handleFor(excludeId);
          if (meshHandle === undefined) continue;
          const mesh = deps.adapter.meshForHandle(meshHandle);
          if (mesh !== undefined) hidden.push(mesh);
        }
        deps.adapter.updateReflectionProbe(pick.state.handle, hidden);
        if (pick.state.updateRate === 0) pick.state.baked = true;
      }

      // Drop probes whose entities disappeared.
      for (const [id, state] of probes) {
        if (!seen.has(id)) {
          deps.adapter.releaseReflectionProbe(state.handle);
          probes.delete(id);
        }
      }


      // 2. Stamp the probe texture onto every entity with an EnvmapBinding.
      // S71 fix: only patch when the probe's texture POINTER actually
      // changed (i.e., a bake just produced a new prefiltered RT). Patching
      // every frame forced `material.needsUpdate = true`, which on WebGPU
      // disposes the previous shader program + bindgroup; the bindgroup
      // may still be referenced by a submitted command buffer that hasn't
      // finished GPU-side, producing the
      // "Destroyed texture [PMREM.cubeUv] used in a submit" validation
      // spam. Comparing by reference is fine because
      // `reflectionProbeTexture` returns the SAME Texture object until the
      // next successful bake replaces it (deferred-dispose ring is in the
      // adapter).
      for (const bindingId of bindingQuery!.run()) {
        const binding = world.getComponent<EnvmapBindingComponent>(bindingId, ENVMAP_BINDING);
        if (binding === undefined) continue;
        const probeState = probes.get(binding.probe);
        if (probeState === undefined) continue;
        const texture: Texture | undefined = deps.adapter.reflectionProbeTexture(probeState.handle);
        if (texture === undefined) continue;
        const meshHandle = deps.registry.handleFor(bindingId);
        if (meshHandle === undefined) continue;
        const previouslyBound = boundTextureByEntity.get(bindingId);
        const intensity = binding.intensity;
        const previousIntensity = boundIntensityByEntity.get(bindingId);
        if (previouslyBound === texture && previousIntensity === intensity) continue;
        deps.adapter.setMeshMaterialPatch(meshHandle, {
          envMap: texture,
          ...(intensity !== undefined ? { envMapIntensity: intensity } : {})
        });
        boundTextureByEntity.set(bindingId, texture);
        if (intensity !== undefined) boundIntensityByEntity.set(bindingId, intensity);
      }
    }
  };
}
