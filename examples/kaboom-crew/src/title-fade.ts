// S096 KABOOM-TITLE-SCREEN-FADE — pure helpers for the title overlay
// fade-out. Extracted so the curve can be unit-tested without spinning
// up a DOM / requestAnimationFrame loop.

import { easingCurves } from "../../../engine/core/systems/tween-system";

/**
 * Returns the title's opacity at `elapsedMs` into a fade of total
 * `durationMs`. Opacity ramps from 1 → 0; uses `easeOutQuad` so the
 * fade starts faster and lingers near zero. Defensive against
 * non-positive durations and out-of-range elapsed values.
 */
export function fadeOutOpacityCurve(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 1;
  if (elapsedMs >= durationMs) return 0;
  const t = elapsedMs / durationMs;
  return 1 - easingCurves.easeOutQuad(t);
}
