// M21-light-directional-point: own the create/destroy + per-frame param
// sync for ECS `Light` entities. Covers `directional` / `point` / `ambient`
// in this story. spot / hemisphere / rect-area land in
// `M21-light-spot-hemisphere-rect`.
//
// Reads: `Light` (component), `LocalToWorld` (from M21-b
// TransformResolveSystem). Writes: adapter mutations via
// LightHandleRegistry, plus a `RenderLightHandle { id }` renderer-internal
// component for diagnostics + handle leak checks.
//
// Fallback lighting policy (`AGF_NO_LIGHTS`):
//   - Adapter starts with the hardcoded ambient + dir fallback so anything
//     renders out of the box.
//   - The first time this system sees at least one ECS Light, it calls
//     `adapter.disableFallbackLighting()`. The ECS lights are now the
//     authoritative source.
//   - If the scene later loses every Light entity, the system emits an
//     `AGF_NO_LIGHTS` runtime diagnostic and re-enables the fallback so
//     the scene doesn't go pitch-black.

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { DiagnosticsBus } from "../../runtime/diagnostics/diagnostics-bus";
import type {
  LightAcquireSpec,
  LightKind,
  LightShadowParams,
  ThreeRenderAdapter
} from "../three-render-adapter";
import type { LightHandleRegistry } from "../light-handle-registry";

export const LIGHT: ComponentName = "Light";
export const LOCAL_TO_WORLD: ComponentName = "LocalToWorld";
export const RENDER_LIGHT_HANDLE: ComponentName = "RenderLightHandle";

const SUPPORTED_KINDS: ReadonlySet<LightKind> = new Set<LightKind>(["directional", "point", "ambient"]);

type LightComponent = {
  kind: LightKind | string;
  color?: string;
  intensity?: number;
  distance?: number;
  decay?: number;
  castShadow?: boolean;
  shadow?: LightShadowParams;
};

type LocalToWorldComponent = {
  position: ReadonlyArray<number>;
  rotation: ReadonlyArray<number>;
  scale: ReadonlyArray<number>;
};

export type LightLifecycleDeps = {
  adapter: ThreeRenderAdapter;
  registry: LightHandleRegistry;
  diagnostics?: DiagnosticsBus | undefined;
};

export type LightLifecycleSystemHandle = System & {
  size(): number;
};

export function createLightLifecycleSystem(
  deps: LightLifecycleDeps,
  options: { name?: string } = {}
): LightLifecycleSystemHandle {
  const name = options.name ?? "render.light-lifecycle";
  let cachedWorld: World | undefined;
  let lightQuery: QueryHandle | undefined;
  // Track what we last acquired so we can detect kind changes (requires
  // release + re-acquire because Three.js light classes can't be swapped).
  const acquiredKind = new Map<EntityId, LightKind>();
  let unsupportedWarned = new Set<string>();
  let warnedAboutNoLights = false;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      lightQuery = world.createQuery([LIGHT]);
      cachedWorld = world;
      unsupportedWarned = new Set();
    }
    const carriers = lightQuery!.run();

    // Phase 1: release entities no longer carrying Light.
    const live = new Set(carriers);
    for (const id of [...deps.registry.entityIds()]) {
      if (!live.has(id)) {
        deps.registry.release(id);
        acquiredKind.delete(id);
        if (world.hasComponent(id, RENDER_LIGHT_HANDLE)) {
          world.removeComponent(id, RENDER_LIGHT_HANDLE);
        }
      }
    }

    // Phase 2: acquire / reconcile each Light entity.
    for (const id of carriers) {
      const comp = world.getComponent<LightComponent>(id, LIGHT);
      if (comp === undefined) continue;
      const kindRaw = comp.kind;
      if (!SUPPORTED_KINDS.has(kindRaw as LightKind)) {
        if (!unsupportedWarned.has(String(kindRaw))) {
          unsupportedWarned.add(String(kindRaw));
          deps.diagnostics?.emit({
            severity: "warning",
            code: "AGF_LIGHT_KIND_UNSUPPORTED",
            source: "light-lifecycle",
            entityId: String(id),
            message: `Light kind "${kindRaw}" is not implemented yet — entity "${id}" will not render until M21-light-spot-hemisphere-rect lands.`
          });
        }
        continue;
      }
      const kind = kindRaw as LightKind;
      const previousKind = acquiredKind.get(id);
      if (previousKind !== undefined && previousKind !== kind) {
        // Light kind changed → must release + re-acquire (Three.js can't swap class).
        deps.registry.release(id);
        acquiredKind.delete(id);
      }

      // Acquire a handle if needed (idempotent — returns existing).
      const spec: LightAcquireSpec = { kind };
      if (comp.color !== undefined) spec.color = comp.color;
      if (comp.intensity !== undefined) spec.intensity = comp.intensity;
      if (kind === "point") {
        if (comp.distance !== undefined) spec.distance = comp.distance;
        if (comp.decay !== undefined) spec.decay = comp.decay;
      }
      const handle = deps.registry.acquireFor(id, spec);
      acquiredKind.set(id, kind);
      world.setComponent(id, RENDER_LIGHT_HANDLE, { id: handle });

      // Per-frame param patch (cheap; Three.js handles dirty-checking internally).
      deps.adapter.setLightParams(handle, {
        ...(comp.color !== undefined ? { color: comp.color } : {}),
        ...(comp.intensity !== undefined ? { intensity: comp.intensity } : {}),
        ...(kind === "point" && comp.distance !== undefined ? { distance: comp.distance } : {}),
        ...(kind === "point" && comp.decay !== undefined ? { decay: comp.decay } : {})
      });

      // Shadow config (gated by castShadow). Ambient ignores; directional / point apply.
      const shadowParams: LightShadowParams = comp.shadow ?? {};
      deps.adapter.setLightCastShadow(handle, comp.castShadow === true, shadowParams);

      // Transform sync — push the resolved world transform onto the light.
      const ltw = world.getComponent<LocalToWorldComponent>(id, LOCAL_TO_WORLD);
      if (ltw !== undefined) {
        deps.adapter.setLightTransform(handle, {
          position: [ltw.position[0] ?? 0, ltw.position[1] ?? 0, ltw.position[2] ?? 0],
          rotation: [ltw.rotation[0] ?? 0, ltw.rotation[1] ?? 0, ltw.rotation[2] ?? 0],
          scale: [ltw.scale[0] ?? 1, ltw.scale[1] ?? 1, ltw.scale[2] ?? 1]
        });
      }
    }

    // AGF_NO_LIGHTS diagnostic + fallback management.
    if (deps.registry.size() > 0) {
      if (deps.adapter.hasFallbackLighting()) {
        deps.adapter.disableFallbackLighting();
      }
      warnedAboutNoLights = false;
    } else {
      if (!deps.adapter.hasFallbackLighting()) {
        deps.adapter.enableFallbackLighting();
      }
      if (!warnedAboutNoLights) {
        warnedAboutNoLights = true;
        deps.diagnostics?.emit({
          severity: "warning",
          code: "AGF_NO_LIGHTS",
          source: "light-lifecycle",
          message:
            "Scene has no Light entities; falling back to default ambient + directional lighting. Add a Light component to an entity to take control."
        });
      }
    }
  };

  return {
    name,
    frameUpdate,
    size(): number {
      return deps.registry.size();
    }
  };
}
