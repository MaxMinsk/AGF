// S278 + S294 — coverage for the engine outline pre-pass system. A fake
// adapter records the calls the system makes so we can assert the inclusion
// contract (render only TALL occluder surfaces) without a real renderer.

import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import { createOutlinePrePassSystem } from "../../engine/render/systems/outline-prepass-system";

type Call =
  | ["acquire", number]
  | ["resize", number]
  | ["release", number]
  | ["render"]
  | ["surface", number, boolean];

function createFakeAdapter() {
  const calls: Call[] = [];
  const depthTexture = { uuid: "depth-tex-1" };
  const camera = {};
  const scene = { traverse(_fn: (o: unknown) => void) { /* no meshes in the fake */ } };
  const surfaceHandles = new Set<number>();
  const adapter = {
    acquireRenderTarget(spec: { width: number; height: number }) { calls.push(["acquire", spec.width * spec.height]); return 1; },
    resizeRenderTarget(_: number, w: number, h: number) { calls.push(["resize", w * h]); },
    releaseRenderTarget(handle: number) { calls.push(["release", handle]); },
    renderSceneToTarget() { calls.push(["render"]); },
    getRenderTargetDepthTexture() { return depthTexture; },
    getActiveCamera() { return camera; },
    getScene() { return scene; },
    setMeshOutlineOccluderSurface(handle: number, on: boolean) {
      calls.push(["surface", handle, on]);
      if (on) surfaceHandles.add(handle); else surfaceHandles.delete(handle);
    },
    outlineOccluderSurfaceMeshes() { return surfaceHandles; },
    // legacy no-ops kept for API stability
    setMeshOutlinePrePassExcluded() {},
    outlinePrePassExcludedMeshes() { return new Set(); }
  } as unknown as Parameters<typeof createOutlinePrePassSystem>[0]["adapter"];
  (adapter as unknown as { canvas: { clientWidth: number; clientHeight: number; width: number; height: number } }).canvas = {
    clientWidth: 800, clientHeight: 600, width: 800, height: 600
  };
  return { adapter, calls, depthTexture };
}

function step(system: { frameUpdate?: (ctx: never) => void }, world: World): void {
  (system.frameUpdate as ((ctx: unknown) => void) | undefined)?.({
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0, physicsAlpha: 0 },
    world
  });
}

function withOccluder(world: World): void {
  world.addEntity("outline");
  world.setComponent("outline", "OutlineOccluder", { color: "#ff0000" });
  world.setComponent("outline", "RenderMeshHandle", { id: 7 });
}
function withSurface(world: World, id: number, handle: number): void {
  world.addEntity(`surf${id}`);
  world.setComponent(`surf${id}`, "OutlineOccluderSurface", {});
  world.setComponent(`surf${id}`, "RenderMeshHandle", { id: handle });
}

describe("createOutlinePrePassSystem (S278/S294)", () => {
  it("dormant when no OutlineOccluder exists — no render", () => {
    const { adapter, calls } = createFakeAdapter();
    step(createOutlinePrePassSystem({ adapter }), new World());
    expect(calls.some((c) => c[0] === "render")).toBe(false);
  });

  it("dormant when occluder present but NO tall surface tagged (flat arena → no x-ray)", () => {
    const { adapter, calls } = createFakeAdapter();
    const world = new World();
    withOccluder(world);
    step(createOutlinePrePassSystem({ adapter }), world);
    expect(calls.some((c) => c[0] === "render")).toBe(false);
  });

  it("renders the pre-pass once an OutlineOccluderSurface is tagged", () => {
    const { adapter, calls } = createFakeAdapter();
    const world = new World();
    withOccluder(world);
    withSurface(world, 1, 100);
    step(createOutlinePrePassSystem({ adapter }), world);
    expect(calls.some((c) => c[0] === "surface" && c[1] === 100 && c[2] === true)).toBe(true);
    expect(calls.some((c) => c[0] === "render")).toBe(true);
  });

  it("untags a surface handle when its marker is removed", () => {
    const { adapter, calls } = createFakeAdapter();
    const world = new World();
    withOccluder(world);
    withSurface(world, 1, 100);
    const sys = createOutlinePrePassSystem({ adapter });
    step(sys, world);
    world.removeComponent("surf1", "OutlineOccluderSurface");
    step(sys, world);
    expect(calls.filter((c) => c[0] === "surface" && c[1] === 100 && c[2] === false).length).toBe(1);
  });

  it("exposes the depth texture only after the first render", () => {
    const { adapter, depthTexture } = createFakeAdapter();
    const sys = createOutlinePrePassSystem({ adapter });
    expect(sys.getDepthTexture()).toBeUndefined();
    const world = new World();
    withOccluder(world);
    withSurface(world, 1, 100);
    step(sys, world);
    expect(sys.getDepthTexture()).toBe(depthTexture);
  });

  it("acquires the depth target at half canvas resolution by default", () => {
    const { adapter, calls } = createFakeAdapter();
    const world = new World();
    withOccluder(world);
    withSurface(world, 1, 100);
    step(createOutlinePrePassSystem({ adapter }), world);
    expect(calls.find((c) => c[0] === "acquire")?.[1]).toBe(400 * 300);
  });

  it("respects an explicit resolutionScale override", () => {
    const { adapter, calls } = createFakeAdapter();
    const world = new World();
    withOccluder(world);
    withSurface(world, 1, 100);
    step(createOutlinePrePassSystem({ adapter, resolutionScale: 0.25 }), world);
    expect(calls.find((c) => c[0] === "acquire")?.[1]).toBe(200 * 150);
  });
});
