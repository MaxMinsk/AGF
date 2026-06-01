// S217 KABOOM-VIGNETTE-OVERLAY (GDP-2026-05-29-002 part 3 — WebGPU
// path). A pure-DOM vignette implementation: a fixed-position
// `<div>` with a radial gradient sits between the renderer canvas
// (z-index ~0) and the HUD layer (z-index 9000+). Costs zero render
// budget + works regardless of the active backend (WebGPU /
// WebGL), unlike the engine-side ShaderPass which only fires when
// the EffectComposer chain is active (WebGL-only).
//
// URL flags:
//   ?vignette=off              disables the overlay
//   ?vignetteIntensity=N       0..1 corner darkness (default 0.4)
//   ?vignetteFalloff=N         0..1 how far from the corner the
//                               darkening begins (default 0.45)

const VIGNETTE_OVERLAY_ID = "kaboom-vignette-overlay";

export type KaboomVignetteOptions = {
  /** Strength of the corner darkening, 0..1. Default 0.4 — subtle
   *  but visible against the warehouse/grass palettes. */
  intensity?: number;
  /** Width of the falloff band, 0..1. 0 = only the very corner
   *  darkens; 1 = the entire frame fades. Default 0.45. */
  falloff?: number;
  /** S218 — base RGB the gradient fades INTO at the corners.
   *  Default black ("#000000"). The per-theme tinting path
   *  (`applyVignetteTint`) updates this in place at runtime when
   *  the active arena theme switches. */
  color?: string;
};

/** Pure helper — build the CSS background-image string for a
 *  radial-gradient vignette with the given params. Exported so
 *  unit tests can lock the gradient shape without a DOM. */
export function buildVignetteBackground(options: KaboomVignetteOptions = {}): string {
  const intensity = clamp01(options.intensity ?? 0.4);
  const falloff = clamp01(options.falloff ?? 0.45);
  const rgb = hexToRgbTriplet(options.color ?? "#000000");
  // The transparent band ends at `1 - falloff` of the way out from
  // centre; from there the band ramps to `rgba(rgb, intensity)` at
  // 100 % (the corner).
  const innerStop = Math.max(0, Math.min(100, (1 - falloff) * 100));
  const alpha = intensity.toFixed(3);
  return `radial-gradient(ellipse at center, rgba(${rgb},0) 0%, rgba(${rgb},0) ${innerStop.toFixed(1)}%, rgba(${rgb},${alpha}) 100%)`;
}

/** Mount the overlay on `document.body`. Safe to call multiple
 *  times — re-mounts reuse the existing node (HMR-friendly).
 *  Returns the element so the caller can hide / remove it later. */
export function mountVignetteOverlay(options: KaboomVignetteOptions = {}): HTMLElement | undefined {
  const doc = (globalThis as unknown as { document?: Document }).document;
  if (doc === undefined || doc.body === undefined) return undefined;
  const existing = doc.getElementById(VIGNETTE_OVERLAY_ID);
  const el = existing ?? doc.createElement("div");
  el.id = VIGNETTE_OVERLAY_ID;
  el.style.cssText = [
    "position:fixed",
    "inset:0",
    "pointer-events:none",
    "z-index:100",
    `background:${buildVignetteBackground(options)}`
  ].join(";");
  if (existing === null) doc.body.appendChild(el);
  return el;
}

/** Read URL flags + return the options the overlay should mount
 *  with, or `undefined` when the user passed `?vignette=off`. */
export function readVignetteOptionsFromUrl(): KaboomVignetteOptions | undefined {
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return {};
  try {
    const params = new URLSearchParams(search);
    if (params.get("vignette") === "off") return undefined;
    const opts: KaboomVignetteOptions = {};
    const iRaw = params.get("vignetteIntensity");
    if (iRaw !== null) {
      const iParsed = Number(iRaw);
      if (Number.isFinite(iParsed)) opts.intensity = iParsed;
    }
    const fRaw = params.get("vignetteFalloff");
    if (fRaw !== null) {
      const fParsed = Number(fRaw);
      if (Number.isFinite(fParsed)) opts.falloff = fParsed;
    }
    return opts;
  } catch {
    return {};
  }
}

/** S218 — apply a per-theme tint to the live overlay. Reads the
 *  existing element off the document, re-writes the CSS background
 *  with the same intensity / falloff and the new `color`. No-op
 *  when the overlay isn't mounted or the document is unavailable
 *  (tests, server-side, `?vignette=off`). */
export function applyVignetteTint(color: string, options: Omit<KaboomVignetteOptions, "color"> = {}): void {
  const doc = (globalThis as unknown as { document?: Document }).document;
  if (doc === undefined) return;
  const el = doc.getElementById(VIGNETTE_OVERLAY_ID);
  if (el === null) return;
  el.style.background = buildVignetteBackground({ ...options, color });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Pure helper — `#rrggbb` → `"r,g,b"` decimal triplet for inline
 *  rgba() composition. Falls back to `0,0,0` for malformed input.
 *  Exported for unit tests. */
export function hexToRgbTriplet(hex: string): string {
  if (typeof hex !== "string") return "0,0,0";
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (m === null) return "0,0,0";
  const v = parseInt(m[1]!, 16);
  const r = (v >>> 16) & 0xff;
  const g = (v >>> 8) & 0xff;
  const b = v & 0xff;
  return `${r},${g},${b}`;
}
