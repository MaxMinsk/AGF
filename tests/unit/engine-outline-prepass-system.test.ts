// S278 — coverage for the engine outline pre-pass system. A fake
// adapter records the calls the system makes so we can assert the
// contract without standing up a real WebGPU renderer.

import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import { createOutlinePrePassSystem } from "../../engine/render/systems/outline-prepass-system";

type Call =
  | ["acquire", number]
  | ["resize", number]
  | ["release", number]
  | ["render"]
  | ["exclude", number, boolean];

function createFakeAdapter(): {
  adapter: Parameters<typeof createOutlinePrePassSystem>[0]["adapter"];
  calls: Call[];
  depthTexture: { uuid: string };
  excludedSet: Set<{ uuid: string }>;
} {
  const calls: Call[] = [];
  const depthTexture = { uuid: "depth-tex-1" };
  const camera = {};
  const scene = {};
  const excludedSet: Set<{ uuid: string }> = new Set();
  const adapter = {
    acquireRenderTarget(spec: { width: number; height: number }) {
      calls.push(["acquire", spec.width * spec.height]);
      return 1;
    },
    resizeRenderTarget(_: number, width: number, height: number) {
      calls.push(["resize", width * height]);
    },
    releaseRenderTarget(handle: number) {
      calls.push(["release", handle]);
    },
    renderSceneToTarget() {
      calls.push(["render"]);
    },
    getRenderTargetDepthTexture() {
      return depthTexture;
    },
    getActiveCamera() {
      return camera;
    },
    getScene() {
      return scene;
    },
    setMeshOutlinePrePassExcluded(handle: number, excluded: boolean) {
      calls.push(["exclude", handle, excluded]);
    },
    outlinePrePassExcludedMeshes(): ReadonlySet<{ uuid: string }> {
      return excludedSet;
    }
  } as unknown as Parameters<typeof createOutlinePrePassSystem>[0]["adapter"];
  (adapter as unknown as { canvas: { clientWidth: number; clientHeight: number; width: number; height: number } }).canvas = {
    clientWidth: 800,
    clientHeight: 600,
    width: 800,
    height: 600
  };
  return { adapter, calls, depthTexture, excludedSet };
}

function step(system: { frameUpdate?: (ctx: never) => void }, world: World): void {
  (system.frameUpdate as ((ctx: unknown) => void) | undefined)?.({
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0, physicsAlpha: 0 },
    world
  });
}

describe("createOutlinePrePassSystem (S278)", () => {
  it("stays dormant when no OutlineOccluder entity exists — no render call", () => {
    const { adapter, calls } = createFakeAdapter();
    const sys = createOutlinePrePassSystem({ adapter });
    const world = new World();
    step(sys, world);
    expect(calls.find((c) => c[0] === "render")).toBeUndefined();
  });

  it("excludes BOTH OutlineOccluder + OutlinePrePassExcluded handles and runs the pre-pass render", () => {
    const { adapter, calls } = createFakeAdapter();
    const sys = createOutlinePrePassSystem({ adapter });
    const world = new World();
    world.addEntity("source");
    world.setComponent("source", "OutlinePrePassExcluded", {});
    world.setComponent("source", "RenderMeshHandle", { id: 42 });
    world.addEntity("outline");
    world.setComponent("outline", "OutlineOccluder", { color: "#ff0000" });
    world.setComponent("outline", "RenderMeshHandle", { id: 7 });
    step(sys, world);
    const tagged = new Set(
      calls.filter((c) => c[0] === "exclude" && c[2] === true).map((c) => c[1])
    );
    expect(tagged.has(42)).toBe(true);
    expect(tagged.has(7)).toBe(true);
    expect(calls.some((c) => c[0] === "render")).toBe(true);
  });

  it("untags a handle when its OutlinePrePassExcluded component is removed", () => {
    const { adapter, calls } = createFakeAdapter();
    const sys = createOutlinePrePassSystem({ adapter });
    const world = new World();
    world.addEntity("outline");
    world.setComponent("outline", "OutlineOccluder", { color: "#ff0000" });
    world.setComponent("outline", "RenderMeshHandle", { id: 7 });
    step(sys, world);
    // drop the trigger
    world.removeComponent("outline", "OutlineOccluder");
    step(sys, world);
    const untags = calls.filter((c) => c[0] === "exclude" && c[1] === 7 && c[2] === false);
    expect(untags.length).toBe(1);
  });

  it("exposes the depth texture only after the first successful pre-pass", () => {
    const { adapter, depthTexture } = createFakeAdapter();
    const sys = createOutlinePrePassSystem({ adapter });
    expect(sys.getDepthTexture()).toBeUndefined();
    const world = new World();
    world.addEntity("outline");
    world.setComponent("outline", "OutlineOccluder", { color: "#ff0000" });
    world.setComponent("outline", "RenderMeshHandle", { id: 1 });
    step(sys, world);
    expect(sys.getDepthTexture()).toBe(depthTexture);
  });

  it("acquires the depth target at half canvas resolution by default", () => {
    const { adapter, calls } = createFakeAdapter();
    const sys = createOutlinePrePassSystem({ adapter });
    const world = new World();
    world.addEntity("outline");
    world.setComponent("outline", "OutlineOccluder", { color: "#ff0000" });
    world.setComponent("outline", "RenderMeshHandle", { id: 1 });
    step(sys, world);
    // 800 × 600 × 0.5² = 400 × 300 = 120000
    expect(calls.find((c) => c[0] === "acquire")?.[1]).toBe(400 * 300);
  });

  it("respects an explicit resolutionScale override", () => {
    const { adapter, calls } = createFakeAdapter();
    const sys = createOutlinePrePassSystem({ adapter, resolutionScale: 0.25 });
    const world = new World();
    world.addEntity("outline");
    world.setComponent("outline", "OutlineOccluder", { color: "#ff0000" });
    world.setComponent("outline", "RenderMeshHandle", { id: 1 });
    step(sys, world);
    // 800 × 0.25 = 200, 600 × 0.25 = 150
    expect(calls.find((c) => c[0] === "acquire")?.[1]).toBe(200 * 150);
  });
});
