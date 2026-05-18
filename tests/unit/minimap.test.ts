// S81 KABOOM-MINIMAP-WIDGET unit tests. Same stub-DOM approach as the
// HUD tests — no jsdom in this repo, so we hand-roll just enough of the
// HTMLCanvasElement + CanvasRenderingContext2D surface for the minimap
// renderer to exercise its projection + shape-draw logic.

import { describe, expect, it, beforeEach } from "vitest";

import { createMinimapWidget } from "../../engine/runtime/ui/minimap";

type Call = { fn: string; args: ReadonlyArray<unknown> };

type StubContext = {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  calls: Call[];
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a: number, b: number): void;
  closePath(): void;
  fill(): void;
};

type StubCanvas = {
  tagName: string;
  width: number;
  height: number;
  attributes: Map<string, string>;
  context: StubContext;
  setAttribute(name: string, value: string): void;
  getContext(kind: string): StubContext | null;
};

function makeContext(): StubContext {
  const calls: Call[] = [];
  const ctx: StubContext = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    calls,
    fillRect(...args) { calls.push({ fn: "fillRect", args: [...args, ctx.fillStyle] }); },
    strokeRect(...args) { calls.push({ fn: "strokeRect", args: [...args, ctx.strokeStyle] }); },
    beginPath() { calls.push({ fn: "beginPath", args: [] }); },
    moveTo(...args) { calls.push({ fn: "moveTo", args }); },
    lineTo(...args) { calls.push({ fn: "lineTo", args }); },
    arc(...args) { calls.push({ fn: "arc", args: [...args, ctx.fillStyle] }); },
    closePath() { calls.push({ fn: "closePath", args: [] }); },
    fill() { calls.push({ fn: "fill", args: [] }); }
  };
  return ctx;
}

function installFakeDocument(): { restore: () => void; lastCanvas: () => StubCanvas | undefined } {
  let last: StubCanvas | undefined;
  const fakeDoc = {
    createElement(tag: string): StubCanvas {
      const canvas: StubCanvas = {
        tagName: tag,
        width: 0,
        height: 0,
        attributes: new Map<string, string>(),
        context: makeContext(),
        setAttribute(name, value): void {
          canvas.attributes.set(name, value);
        },
        getContext(kind): StubContext | null {
          return kind === "2d" ? canvas.context : null;
        }
      };
      last = canvas;
      return canvas;
    }
  };
  const previous = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = fakeDoc;
  return {
    restore(): void {
      (globalThis as { document?: unknown }).document = previous;
    },
    lastCanvas(): StubCanvas | undefined {
      return last;
    }
  };
}

describe("createMinimapWidget (S81 KABOOM-MINIMAP-WIDGET)", () => {
  let dom: ReturnType<typeof installFakeDocument>;

  beforeEach(() => {
    dom = installFakeDocument();
  });

  it("returns a HudWidgetSpec with default id + slot", () => {
    const spec = createMinimapWidget({ bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } });
    expect(spec.id).toBe("minimap");
    expect(spec.slot).toBe("topRight");
  });

  it("first render() creates a canvas of the requested pixel size", () => {
    const spec = createMinimapWidget({
      bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 },
      pixelSize: 200
    });
    spec.render({ markers: [] });
    const canvas = dom.lastCanvas()!;
    expect(canvas.tagName).toBe("canvas");
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(200);
  });

  it("draws background + border on every render", () => {
    const spec = createMinimapWidget({
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      pixelSize: 100
    });
    spec.render({ markers: [] });
    const canvas = dom.lastCanvas()!;
    const fns = canvas.context.calls.map((c) => c.fn);
    expect(fns).toContain("fillRect");
    expect(fns).toContain("strokeRect");
  });

  it("projects markers from world bounds onto canvas coords", () => {
    // 100×100 px canvas, bounds 0..10 on both axes ⇒ 10 px per world unit.
    // Marker at (5, 7) ⇒ canvas (50, 70).
    const spec = createMinimapWidget({
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      pixelSize: 100
    });
    spec.render({ markers: [{ x: 5, z: 7, color: "#abcdef", shape: "rect", size: 4 }] });
    const canvas = dom.lastCanvas()!;
    // Last fillRect after the background should be the marker:
    const fillRects = canvas.context.calls.filter((c) => c.fn === "fillRect");
    const marker = fillRects[fillRects.length - 1]!;
    expect(marker.args[0]).toBeCloseTo(50 - 2, 4); // px - size/2
    expect(marker.args[1]).toBeCloseTo(70 - 2, 4); // py - size/2
    expect(marker.args[2]).toBe(4);
    expect(marker.args[3]).toBe(4);
    expect(marker.args[4]).toBe("#abcdef"); // fillStyle snapshotted at call time
  });

  it("skips markers outside the declared bounds", () => {
    const spec = createMinimapWidget({
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      pixelSize: 100
    });
    spec.render({
      markers: [
        { x: 5, z: 5, shape: "rect" }, // inside
        { x: 100, z: 100, shape: "rect" }, // far outside
        { x: -100, z: 5, shape: "rect" } // outside on X
      ]
    });
    const canvas = dom.lastCanvas()!;
    // 1 background fillRect + 1 marker fillRect = 2 total.
    const fillRects = canvas.context.calls.filter((c) => c.fn === "fillRect");
    expect(fillRects).toHaveLength(2);
  });

  it("dot shape uses arc; triangle uses moveTo+lineTo+lineTo", () => {
    const spec = createMinimapWidget({
      bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
      pixelSize: 100
    });
    spec.render({
      markers: [
        { x: 0, z: 0, shape: "dot" },
        { x: 0.5, z: 0.5, shape: "triangle" }
      ]
    });
    const canvas = dom.lastCanvas()!;
    const fns = canvas.context.calls.map((c) => c.fn);
    expect(fns).toContain("arc");
    // Triangle path: beginPath -> moveTo -> lineTo -> lineTo -> closePath -> fill.
    const triangleStart = fns.lastIndexOf("beginPath");
    expect(fns.slice(triangleStart, triangleStart + 6)).toEqual([
      "beginPath",
      "moveTo",
      "lineTo",
      "lineTo",
      "closePath",
      "fill"
    ]);
  });

  it("viewer option pins a marker at the canvas centre", () => {
    const spec = createMinimapWidget({
      bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 },
      pixelSize: 120,
      viewer: { color: "#ff00ff", size: 5 }
    });
    spec.render({ markers: [] });
    const canvas = dom.lastCanvas()!;
    const moveCall = canvas.context.calls.find((c) => c.fn === "moveTo");
    expect(moveCall).toBeDefined();
    // Centre of 120 px canvas = (60, 60); triangle top point is (60, 60 - 5).
    expect(moveCall!.args[0]).toBeCloseTo(60, 4);
    expect(moveCall!.args[1]).toBeCloseTo(60 - 5, 4);
  });

  it("renders into the same canvas across multiple updates (stable node)", () => {
    const spec = createMinimapWidget({
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      pixelSize: 80
    });
    const first = spec.render({ markers: [] });
    const second = spec.render({ markers: [{ x: 1, z: 1, shape: "dot" }] });
    expect(first).toBe(second);
  });
});
