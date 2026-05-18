// S81 KABOOM-MINIMAP-WIDGET. Canvas-backed minimap widget that plugs
// into the engine HUD runtime (`engine/runtime/ui/hud.ts`). Provides a
// `createMinimapWidget(options)` factory returning a HudWidgetSpec the
// caller passes straight to `runtime.hud.add(spec)`. Project code then
// pushes marker lists each frame via `runtime.hud.update(id, { markers })`.
//
// The widget is intentionally project-agnostic: it doesn't run ECS
// queries itself, doesn't know about Kaboom Crew or any specific game.
// Drawing is Canvas2D fillRect / arc — fine for hundreds of markers; if
// a project needs thousands, swap the renderer for an instanced WebGL
// pass later without touching this surface.

import type { HudSlot, HudWidgetSpec } from "./hud";

export type MinimapShape = "dot" | "rect" | "triangle";

export type MinimapMarker = {
  /** World-space X (or world-space first horizontal axis the project picks). */
  x: number;
  /** World-space Z (or second horizontal axis). */
  z: number;
  /** Any valid Canvas2D fillStyle string. Defaults to "#ffffff". */
  color?: string;
  /** Marker shape. Default `dot`. */
  shape?: MinimapShape;
  /** Pixel radius (dot/triangle) or side length (rect). Default 3. */
  size?: number;
};

export type MinimapBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type MinimapData = {
  markers: ReadonlyArray<MinimapMarker>;
};

export type MinimapWidgetOptions = {
  /** HUD widget id; defaults to `"minimap"`. */
  id?: string;
  /** HUD slot to mount in; defaults to `topRight`. */
  slot?: HudSlot;
  /** World-space rectangle the minimap covers. */
  bounds: MinimapBounds;
  /** Side length of the (square) minimap canvas in CSS pixels. Default 160. */
  pixelSize?: number;
  /** Optional background fill. Default `rgba(0,0,0,0.55)` matches the HUD widget style. */
  background?: string;
  /** Optional border colour. Default `rgba(255,255,255,0.25)`. */
  border?: string;
  /**
   * Optional viewer marker: when set the widget draws a stronger reference
   * marker on top of the per-frame list. Useful for "you-are-here" indicators
   * a game wants to keep pinned regardless of the markers it streams.
   */
  viewer?: { color?: string; size?: number } | undefined;
};

/**
 * Build a HudWidgetSpec for a minimap. The returned spec is stateful: the
 * factory owns a persistent `<canvas>` element + its 2D context, and every
 * call to `render(data)` re-paints into that same canvas. The HUD will
 * append/replace the same node each update — DOM cost stays O(1) regardless
 * of marker count.
 */
export function createMinimapWidget(options: MinimapWidgetOptions): HudWidgetSpec<MinimapData> {
  const id = options.id ?? "minimap";
  const slot: HudSlot = options.slot ?? "topRight";
  const pixelSize = Math.max(32, options.pixelSize ?? 160);
  const background = options.background ?? "rgba(0,0,0,0.55)";
  const border = options.border ?? "rgba(255,255,255,0.25)";

  let canvas: HTMLCanvasElement | undefined;
  let ctx: CanvasRenderingContext2D | undefined;

  function ensureCanvas(): HTMLCanvasElement {
    if (canvas !== undefined) return canvas;
    // Lazy create: deferred until first render so the factory has no DOM
    // dependency at construction time (tests can call the factory in a
    // pure environment).
    const doc = globalThis.document;
    if (doc === undefined) {
      throw new Error("[agf:minimap] createMinimapWidget render called outside a DOM environment.");
    }
    canvas = doc.createElement("canvas");
    canvas.width = pixelSize;
    canvas.height = pixelSize;
    canvas.setAttribute("style", `width:${pixelSize}px;height:${pixelSize}px;display:block;`);
    const c = canvas.getContext("2d");
    if (c === null) {
      throw new Error("[agf:minimap] canvas.getContext('2d') returned null.");
    }
    ctx = c;
    return canvas;
  }

  function paint(data: MinimapData): HTMLCanvasElement {
    const el = ensureCanvas();
    const c = ctx as CanvasRenderingContext2D;
    // Background + frame.
    c.fillStyle = background;
    c.fillRect(0, 0, pixelSize, pixelSize);
    c.strokeStyle = border;
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, pixelSize - 1, pixelSize - 1);

    const rangeX = options.bounds.maxX - options.bounds.minX;
    const rangeZ = options.bounds.maxZ - options.bounds.minZ;
    if (rangeX <= 0 || rangeZ <= 0) return el;

    // Map world (x, z) → canvas (px, py). Z-axis flipped so larger Z
    // shows lower on the minimap (matches typical top-down render).
    function project(x: number, z: number): { px: number; py: number } {
      const px = ((x - options.bounds.minX) / rangeX) * pixelSize;
      const py = ((z - options.bounds.minZ) / rangeZ) * pixelSize;
      return { px, py };
    }

    for (const marker of data.markers) {
      const { px, py } = project(marker.x, marker.z);
      // Skip out-of-bounds markers — the widget represents only the
      // declared rectangle.
      if (px < 0 || px > pixelSize || py < 0 || py > pixelSize) continue;
      c.fillStyle = marker.color ?? "#ffffff";
      const size = Math.max(1, marker.size ?? 3);
      drawShape(c, marker.shape ?? "dot", px, py, size);
    }

    if (options.viewer !== undefined) {
      // Pin a viewer indicator at minimap centre by default — projects that
      // want it tied to a moving entity feed that entity into the markers
      // list with their own shape and skip this convenience instead.
      c.fillStyle = options.viewer.color ?? "#ffd166";
      const size = Math.max(2, options.viewer.size ?? 4);
      drawShape(c, "triangle", pixelSize / 2, pixelSize / 2, size);
    }
    return el;
  }

  return {
    id,
    slot,
    render: paint
  };
}

function drawShape(
  c: CanvasRenderingContext2D,
  shape: MinimapShape,
  px: number,
  py: number,
  size: number
): void {
  if (shape === "rect") {
    c.fillRect(px - size / 2, py - size / 2, size, size);
    return;
  }
  if (shape === "triangle") {
    c.beginPath();
    c.moveTo(px, py - size);
    c.lineTo(px + size, py + size);
    c.lineTo(px - size, py + size);
    c.closePath();
    c.fill();
    return;
  }
  // dot
  c.beginPath();
  c.arc(px, py, size, 0, Math.PI * 2);
  c.fill();
}
