// S88 AGF-PARTICLE-PREWARM-SYSTEM.

import { describe, expect, it, vi } from "vitest";
import type { Matrix4 } from "three";

import { World } from "../../engine/core/ecs/world";
import { createParticleEmitterSystem } from "../../engine/render/systems/particle-emitter-system";
import type { ParticlePoolHandle, ThreeRenderAdapter } from "../../engine/render/three-render-adapter";

type StubAdapter = Pick<
  ThreeRenderAdapter,
  "acquireParticlePool" | "setParticleInstances" | "releaseParticlePool"
>;

function makeStubAdapter() {
  let next = 1;
  const live = new Set<ParticlePoolHandle>();
  let peak = 0;
  const acquire = vi.fn((_spec: { color: string; capacity: number; radius: number }) => {
    const h = next as ParticlePoolHandle;
    next += 1;
    live.add(h);
    if (live.size > peak) peak = live.size;
    return h;
  });
  const setInstances = vi.fn((_h: ParticlePoolHandle, _m: ReadonlyArray<Matrix4>, _n: number) => {});
  const release = vi.fn((h: ParticlePoolHandle) => {
    live.delete(h);
  });
  const adapter: StubAdapter = {
    acquireParticlePool: acquire,
    setParticleInstances: setInstances,
    releaseParticlePool: release
  };
  return {
    adapter,
    liveSize: () => live.size,
    peak: () => peak,
    acquire,
    setInstances,
    release
  };
}

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

describe("createParticleEmitterSystem (S88 AGF-PARTICLE-PREWARM-SYSTEM)", () => {
  it("preWarmPresets=[] is a no-op (no acquires)", () => {
    const stub = makeStubAdapter();
    const system = createParticleEmitterSystem({ adapter: stub.adapter });
    const world = new World();
    system.frameUpdate!(ctx(world));
    expect(stub.acquire).not.toHaveBeenCalled();
  });

  it("preWarmPresets=['spark'] acquires one pool on the first frame", () => {
    const stub = makeStubAdapter();
    const system = createParticleEmitterSystem({
      adapter: stub.adapter,
      preWarmPresets: ["spark"]
    });
    const world = new World();
    system.frameUpdate!(ctx(world));
    expect(stub.acquire).toHaveBeenCalledTimes(1);
    expect(stub.acquire.mock.calls[0]![0]).toMatchObject({ capacity: 1 });
    expect(stub.setInstances).toHaveBeenCalledTimes(1);
  });

  it("preWarmPresets=['spark','glow'] acquires one pool per preset", () => {
    const stub = makeStubAdapter();
    const system = createParticleEmitterSystem({
      adapter: stub.adapter,
      preWarmPresets: ["spark", "glow"]
    });
    const world = new World();
    system.frameUpdate!(ctx(world));
    expect(stub.acquire).toHaveBeenCalledTimes(2);
    expect(stub.liveSize()).toBe(2);
    expect(stub.peak()).toBe(2);
  });

  it("pre-warm pools are released after preWarmFrames frames", () => {
    const stub = makeStubAdapter();
    const system = createParticleEmitterSystem({
      adapter: stub.adapter,
      preWarmPresets: ["spark"],
      preWarmFrames: 2
    });
    const world = new World();
    system.frameUpdate!(ctx(world)); // frame 1: acquire + decrement to 1
    expect(stub.liveSize()).toBe(1);
    system.frameUpdate!(ctx(world)); // frame 2: decrement to 0 → release fires
    expect(stub.liveSize()).toBe(0);
    expect(stub.release).toHaveBeenCalledTimes(1);
  });

  it("peak survives the release — agents can confirm warmup ran via peak", () => {
    const stub = makeStubAdapter();
    const system = createParticleEmitterSystem({
      adapter: stub.adapter,
      preWarmPresets: ["spark", "glow"],
      preWarmFrames: 1
    });
    const world = new World();
    system.frameUpdate!(ctx(world));
    system.frameUpdate!(ctx(world));
    expect(stub.liveSize()).toBe(0);
    // Peak retained by the stub registry; the adapter pools peak survives the release.
    expect(stub.peak()).toBe(2);
  });

  it("re-arms pre-warm when the world swaps (scene.load)", () => {
    const stub = makeStubAdapter();
    const system = createParticleEmitterSystem({
      adapter: stub.adapter,
      preWarmPresets: ["spark"],
      preWarmFrames: 1
    });
    const worldA = new World();
    system.frameUpdate!(ctx(worldA));
    system.frameUpdate!(ctx(worldA));
    expect(stub.acquire).toHaveBeenCalledTimes(1);
    // Swap world → pre-warm fires again.
    const worldB = new World();
    system.frameUpdate!(ctx(worldB));
    expect(stub.acquire).toHaveBeenCalledTimes(2);
  });
});
