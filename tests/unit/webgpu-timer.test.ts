// S70 WEBGPU-gpu-timer. Coverage for the WebGPU GPU-timer helper. Three.js
// owns the actual `GPUQuerySet` lifecycle (begin/end timestamps, query
// pool, readback) when the renderer is constructed with
// `trackTimestamp: true` — this helper only throttles resolve calls and
// converts the resolved `info.render.timestamp` (nanoseconds) into
// milliseconds. The mock here drives that throttling logic without going
// near a real GPUDevice.

import { describe, expect, it, vi } from "vitest";
import { WebGpuTimer, type WebGpuTimerHost } from "../../engine/render/webgpu/webgpu-timer";

type MockHost = WebGpuTimerHost & {
  resolveTimestampsAsync: ReturnType<typeof vi.fn>;
  info: { render: { timestamp: number } };
  resolveLatch: { resolve: () => void; reject: (err: Error) => void } | undefined;
};

function makeHost(): MockHost {
  const host = {
    info: { render: { timestamp: 0 } },
    resolveLatch: undefined as MockHost["resolveLatch"]
  } as MockHost;
  host.resolveTimestampsAsync = vi.fn(
    (): Promise<number | undefined> =>
      new Promise<number | undefined>((resolve, reject) => {
        host.resolveLatch = {
          resolve: () => resolve(undefined),
          reject
        };
      })
  );
  return host;
}

describe("WebGpuTimer", () => {
  it("returns undefined until the first resolve completes", async () => {
    const host = makeHost();
    const timer = new WebGpuTimer(host, 1);
    expect(timer.read()).toBeUndefined();
    timer.onFrame();
    expect(timer.read()).toBeUndefined();
    host.info.render.timestamp = 1_500_000;
    host.resolveLatch?.resolve();
    await flush();
    expect(timer.read()).toBeCloseTo(1.5, 5);
  });

  it("throttles resolve to once per N frames", () => {
    const host = makeHost();
    const timer = new WebGpuTimer(host, 5);
    for (let i = 0; i < 4; i++) timer.onFrame();
    expect(host.resolveTimestampsAsync).not.toHaveBeenCalled();
    timer.onFrame();
    expect(host.resolveTimestampsAsync).toHaveBeenCalledTimes(1);
  });

  it("does not stack a new resolve while one is in flight", async () => {
    const host = makeHost();
    const timer = new WebGpuTimer(host, 1);
    timer.onFrame();
    expect(host.resolveTimestampsAsync).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) timer.onFrame();
    expect(host.resolveTimestampsAsync).toHaveBeenCalledTimes(1);
    host.info.render.timestamp = 2_000_000;
    host.resolveLatch?.resolve();
    await flush();
    expect(timer.read()).toBeCloseTo(2, 5);
    timer.onFrame();
    expect(host.resolveTimestampsAsync).toHaveBeenCalledTimes(2);
  });

  it("survives a rejected resolve without crashing or updating lastMs", async () => {
    const host = makeHost();
    const timer = new WebGpuTimer(host, 1);
    host.info.render.timestamp = 1_000_000;
    timer.onFrame();
    host.resolveLatch?.resolve();
    await flush();
    expect(timer.read()).toBeCloseTo(1, 5);

    timer.onFrame();
    host.resolveLatch?.reject(new Error("simulated query pool overflow"));
    await flush();
    expect(timer.read()).toBeCloseTo(1, 5);
  });

  it("ignores zero-timestamp readings so undefined stays sticky", async () => {
    const host = makeHost();
    const timer = new WebGpuTimer(host, 1);
    host.info.render.timestamp = 0;
    timer.onFrame();
    host.resolveLatch?.resolve();
    await flush();
    expect(timer.read()).toBeUndefined();
  });
});

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
