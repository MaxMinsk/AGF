import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import {
  createLightLifecycleSystem,
  RENDER_LIGHT_HANDLE
} from "../../engine/render/systems/light-lifecycle-system";
import type { LightHandleRegistry } from "../../engine/render/light-handle-registry";
import type { DiagnosticsBus, EmitDiagnosticInput, RuntimeDiagnostic } from "../../engine/runtime/diagnostics/diagnostics-bus";
import type {
  LightAcquireSpec,
  LightHandle,
  LightPatch,
  LightShadowParams,
  ResolvedWorld,
  ThreeRenderAdapter as Adapter
} from "../../engine/render/three-render-adapter";

// Test stub: tracks every call into the adapter so we can assert behaviour
// without instantiating a WebGLRenderer.
function stubAdapter() {
  let nextHandle = 1;
  const acquired: Array<{ handle: LightHandle; spec: LightAcquireSpec }> = [];
  const released: LightHandle[] = [];
  const params: Array<{ handle: LightHandle; patch: LightPatch }> = [];
  const transforms: Array<{ handle: LightHandle; world: ResolvedWorld }> = [];
  const shadows: Array<{ handle: LightHandle; cast: boolean; params: LightShadowParams }> = [];
  let fallbackOn = true;
  let live = 0;
  return {
    acquireLight(spec: LightAcquireSpec): LightHandle {
      const h = nextHandle;
      nextHandle += 1;
      live += 1;
      acquired.push({ handle: h, spec });
      return h;
    },
    releaseLight(h: LightHandle): void {
      released.push(h);
      live -= 1;
    },
    setLightParams(handle: LightHandle, patch: LightPatch): void {
      params.push({ handle, patch });
    },
    setLightTransform(handle: LightHandle, world: ResolvedWorld): void {
      transforms.push({ handle, world });
    },
    setLightCastShadow(handle: LightHandle, cast: boolean, p: LightShadowParams = {}): void {
      shadows.push({ handle, cast, params: p });
    },
    enableFallbackLighting(): void {
      fallbackOn = true;
    },
    disableFallbackLighting(): void {
      fallbackOn = false;
    },
    hasFallbackLighting(): boolean {
      return fallbackOn;
    },
    hasLight(handle: LightHandle): boolean {
      return acquired.some((a) => a.handle === handle) && !released.includes(handle);
    },
    lightCount(): number {
      return live;
    },
    // unused but required by structural typing
    acquired,
    released,
    params,
    transforms,
    shadows,
    get fallback(): boolean {
      return fallbackOn;
    }
  };
}

function stubRegistry(adapter: ReturnType<typeof stubAdapter>): LightHandleRegistry {
  const byEntity = new Map<string, LightHandle>();
  return {
    acquireFor(entityId, spec): LightHandle {
      const existing = byEntity.get(entityId);
      if (existing !== undefined) return existing;
      const h = adapter.acquireLight(spec);
      byEntity.set(entityId, h);
      return h;
    },
    release(entityId): void {
      const h = byEntity.get(entityId);
      if (h === undefined) return;
      adapter.releaseLight(h);
      byEntity.delete(entityId);
    },
    handleFor(entityId): LightHandle | undefined {
      return byEntity.get(entityId);
    },
    entityIds() {
      return byEntity.keys();
    },
    size(): number {
      return byEntity.size;
    },
    clear(): void {
      for (const h of byEntity.values()) adapter.releaseLight(h);
      byEntity.clear();
    }
  };
}

function stubDiagnostics(): DiagnosticsBus & { collected: RuntimeDiagnostic[] } {
  const collected: RuntimeDiagnostic[] = [];
  let nextId = 1;
  return {
    emit(input: EmitDiagnosticInput): RuntimeDiagnostic {
      const d: RuntimeDiagnostic = {
        id: nextId++,
        emittedAtSeconds: 0,
        severity: input.severity,
        code: input.code,
        source: input.source,
        message: input.message,
        ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
        ...(input.component !== undefined ? { component: input.component } : {})
      };
      collected.push(d);
      return d;
    },
    snapshot: () => collected,
    snapshotSince: (thresholdSeconds: number) => collected.filter((d) => d.emittedAtSeconds > thresholdSeconds),
    clear: () => collected.splice(0, collected.length),
    subscribe: () => () => {},
    collected
  };
}

function ctx(world: World) {
  return {
    world,
    time: {
      elapsed: 0,
      dt: 1 / 60,
      fixedDt: 1 / 60,
      frameCount: 0,
      fixedStepCount: 0
    }
  } as const;
}

describe("LightLifecycleSystem (M21-light-directional-point)", () => {
  it("acquires a Three.js light per ECS Light entity and writes RenderLightHandle", () => {
    const adapter = stubAdapter();
    const registry = stubRegistry(adapter);
    const diagnostics = stubDiagnostics();
    const world = new World();
    world.addEntity("sun");
    world.setComponent("sun", "Light", { kind: "directional", color: "#fff8e7", intensity: 2 });
    world.setComponent("sun", "LocalToWorld", { position: [5, 10, 7], rotation: [0, 0, 0], scale: [1, 1, 1] });

    const system = createLightLifecycleSystem({ adapter: adapter as unknown as Adapter, registry, diagnostics });
    system.frameUpdate?.(ctx(world));

    expect(adapter.acquired).toHaveLength(1);
    expect(adapter.acquired[0]?.spec.kind).toBe("directional");
    expect(adapter.acquired[0]?.spec.intensity).toBe(2);
    expect(world.hasComponent("sun", RENDER_LIGHT_HANDLE)).toBe(true);
    expect(adapter.transforms.at(-1)?.world.position).toEqual([5, 10, 7]);
  });

  it("disables fallback lighting after the first ECS light appears", () => {
    const adapter = stubAdapter();
    const registry = stubRegistry(adapter);
    const diagnostics = stubDiagnostics();
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "Light", { kind: "ambient" });

    const system = createLightLifecycleSystem({ adapter: adapter as unknown as Adapter, registry, diagnostics });
    expect(adapter.fallback).toBe(true);
    system.frameUpdate?.(ctx(world));
    expect(adapter.fallback).toBe(false);
  });

  it("re-enables fallback + emits AGF_NO_LIGHTS when the scene loses every Light", () => {
    const adapter = stubAdapter();
    const registry = stubRegistry(adapter);
    const diagnostics = stubDiagnostics();
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "Light", { kind: "ambient" });
    const system = createLightLifecycleSystem({ adapter: adapter as unknown as Adapter, registry, diagnostics });
    system.frameUpdate?.(ctx(world));
    expect(adapter.fallback).toBe(false);

    world.removeComponent("a", "Light");
    system.frameUpdate?.(ctx(world));
    expect(adapter.fallback).toBe(true);
    expect(diagnostics.collected.some((d) => d.code === "AGF_NO_LIGHTS")).toBe(true);
  });

  it("releases the handle + removes RenderLightHandle when Light is gone", () => {
    const adapter = stubAdapter();
    const registry = stubRegistry(adapter);
    const diagnostics = stubDiagnostics();
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "Light", { kind: "point", intensity: 5 });

    const system = createLightLifecycleSystem({ adapter: adapter as unknown as Adapter, registry, diagnostics });
    system.frameUpdate?.(ctx(world));
    expect(world.hasComponent("a", RENDER_LIGHT_HANDLE)).toBe(true);

    world.removeComponent("a", "Light");
    system.frameUpdate?.(ctx(world));
    expect(world.hasComponent("a", RENDER_LIGHT_HANDLE)).toBe(false);
    expect(adapter.released).toEqual([1]);
  });

  it("propagates intensity changes via setLightParams every frame", () => {
    const adapter = stubAdapter();
    const registry = stubRegistry(adapter);
    const diagnostics = stubDiagnostics();
    const world = new World();
    world.addEntity("p");
    world.setComponent("p", "Light", { kind: "point", intensity: 1 });
    const system = createLightLifecycleSystem({ adapter: adapter as unknown as Adapter, registry, diagnostics });

    system.frameUpdate?.(ctx(world));
    world.setComponent("p", "Light", { kind: "point", intensity: 8 });
    system.frameUpdate?.(ctx(world));

    const lastPatch = adapter.params.at(-1)?.patch;
    expect(lastPatch?.intensity).toBe(8);
  });

  it("re-acquires a new handle when the kind changes (Three.js can't swap class)", () => {
    const adapter = stubAdapter();
    const registry = stubRegistry(adapter);
    const diagnostics = stubDiagnostics();
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "Light", { kind: "directional" });
    const system = createLightLifecycleSystem({ adapter: adapter as unknown as Adapter, registry, diagnostics });

    system.frameUpdate?.(ctx(world));
    world.setComponent("a", "Light", { kind: "point" });
    system.frameUpdate?.(ctx(world));

    expect(adapter.released).toEqual([1]);
    expect(adapter.acquired).toHaveLength(2);
    expect(adapter.acquired[1]?.spec.kind).toBe("point");
  });

  it("warns on truly unsupported kind (e.g. typo'd 'sptolite')", () => {
    const adapter = stubAdapter();
    const registry = stubRegistry(adapter);
    const diagnostics = stubDiagnostics();
    const world = new World();
    world.addEntity("s");
    world.setComponent("s", "Light", { kind: "sptolite" });
    const system = createLightLifecycleSystem({ adapter: adapter as unknown as Adapter, registry, diagnostics });
    system.frameUpdate?.(ctx(world));

    expect(adapter.acquired).toHaveLength(0);
    expect(diagnostics.collected.some((d) => d.code === "AGF_LIGHT_KIND_UNSUPPORTED")).toBe(true);
  });

  it("acquires every kind from M21-light-spot-hemisphere-rect (spot/hemisphere/rect-area)", () => {
    const adapter = stubAdapter();
    const registry = stubRegistry(adapter);
    const diagnostics = stubDiagnostics();
    const world = new World();
    world.addEntity("s");
    world.setComponent("s", "Light", { kind: "spot", angle: 0.5, penumbra: 0.2 });
    world.addEntity("h");
    world.setComponent("h", "Light", { kind: "hemisphere", groundColor: "#222" });
    world.addEntity("r");
    world.setComponent("r", "Light", { kind: "rect-area", width: 2, height: 1 });
    const system = createLightLifecycleSystem({ adapter: adapter as unknown as Adapter, registry, diagnostics });
    system.frameUpdate?.(ctx(world));

    expect(adapter.acquired).toHaveLength(3);
    const kinds = adapter.acquired.map((a) => a.spec.kind).sort();
    expect(kinds).toEqual(["hemisphere", "rect-area", "spot"]);
    expect(diagnostics.collected.some((d) => d.code === "AGF_LIGHT_KIND_UNSUPPORTED")).toBe(false);
  });

  it("applies shadow params when castShadow is true", () => {
    const adapter = stubAdapter();
    const registry = stubRegistry(adapter);
    const diagnostics = stubDiagnostics();
    const world = new World();
    world.addEntity("sun");
    world.setComponent("sun", "Light", {
      kind: "directional",
      intensity: 1,
      castShadow: true,
      shadow: { mapSize: 1024, bias: -0.0005 }
    });
    const system = createLightLifecycleSystem({ adapter: adapter as unknown as Adapter, registry, diagnostics });
    system.frameUpdate?.(ctx(world));

    const last = adapter.shadows.at(-1);
    expect(last?.cast).toBe(true);
    expect(last?.params.mapSize).toBe(1024);
    expect(last?.params.bias).toBe(-0.0005);
  });
});
