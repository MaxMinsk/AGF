// M19-tween: data-driven Tween component + advancer system.
//
// Each entity carries a `Tweens` array (one or more tweens). On every
// fixed step the system:
//   1. Accumulates `elapsed += dt` for every tween in the array.
//   2. Computes `t = clamp(elapsed / duration, 0, 1)`, applies easing.
//   3. Writes `from + (to - from) * easedT` into
//      `entity.components[component][property]`.
//   4. On completion: drops the tween (`loop: "none"`), wraps elapsed
//      back to 0 (`"loop"`), or flips from/to (`"ping-pong"`).
//
// Pure ECS — no renderer / DOM access.
//
// S71: switched from fixedUpdate to frameUpdate. Tweens drive cosmetic
// animations (repair flash, particle pickup glints, UI fades). Tying
// them to the simulation accumulator meant the same spiral-of-death cap
// that throttles spin / waypoint movers under heavy frames would also
// freeze in-flight tweens mid-curve. The replay-reproducibility note
// previously here was aspirational — Tween consumes its own `elapsed`
// and there's no determinism harness that exercises mid-tween snapshots,
// so swapping the hook is safe.

import type { ComponentName, EntityId } from "../ecs/types";
import type { QueryHandle, World } from "../ecs/world";
import type { System, SystemContext } from "../systems/types";

export const TWEENS: ComponentName = "Tweens";

/**
 * S91 M19-EASING-LIBRARY. Named easing curves. The original v0 set
 * (linear / easeIn / easeOut / easeInOut / pulse) is preserved; the
 * v1 set adds explicit Quad / Cubic / Quart variants + easeOutBack
 * (small overshoot) and easeOutElastic (bounce). Legacy aliases
 * easeIn / easeOut / easeInOut continue to behave as Quad variants
 * for backwards-compat with existing scenes.
 */
export type TweenEase =
  | "linear"
  | "easeIn"          // alias for easeInQuad (legacy)
  | "easeOut"         // alias for easeOutQuad (legacy)
  | "easeInOut"       // alias for easeInOutQuad (legacy)
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic"
  | "easeInQuart"
  | "easeOutQuart"
  | "easeInOutQuart"
  | "easeOutBack"
  | "easeOutElastic"
  | "pulse";

export type TweenLoop = "none" | "loop" | "ping-pong";

export type TweenSpec = {
  component: ComponentName;
  property: string;
  from: number | number[];
  to: number | number[];
  duration: number;
  ease?: TweenEase;
  loop?: TweenLoop;
  elapsed?: number;
};

/**
 * S91 M19-EASING-LIBRARY. Pure helper table keyed by easing name.
 * Every curve must satisfy curve(0) = 0 and curve(1) = 1; midpoint
 * deviation is what distinguishes them. Exposed so unit tests and
 * project code can sample curves without depending on the system.
 *
 * Overshoot curves (easeOutBack / easeOutElastic) intentionally
 * exceed [0,1] mid-flight before settling on 1.
 */
export const easingCurves: Readonly<Record<TweenEase, (t: number) => number>> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - Math.pow(1 - t, 4),
  easeInOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  easeOutBack: (t) => {
    // c1 / c3 are the standard Robert Penner constants for a small
    // overshoot — peaks around t≈0.74 at value ≈1.10.
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeOutElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  // Sine half-wave — 0 at t=0, peak (1) at t=0.5, 0 at t=1. One-shot
  // bounces / glints / damage flashes use this.
  pulse: (t) => Math.sin(Math.PI * t)
};

function easeFn(kind: TweenEase | undefined, t: number): number {
  if (kind === undefined) return t;
  const fn = easingCurves[kind];
  return fn !== undefined ? fn(t) : t;
}

/** Linear interpolation between `from` and `to` at parameter `t∈[0,1]`. */
function lerpValue(
  from: number | number[],
  to: number | number[],
  t: number
): number | number[] {
  if (typeof from === "number" && typeof to === "number") {
    return from + (to - from) * t;
  }
  if (Array.isArray(from) && Array.isArray(to)) {
    const n = Math.min(from.length, to.length);
    const out = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
      const a = from[i] ?? 0;
      const b = to[i] ?? 0;
      out[i] = a + (b - a) * t;
    }
    return out;
  }
  // Mixed types — fall back to `to` to avoid corrupting the component.
  return to;
}

export function createTweenSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "core.tween";
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      query = world.createQuery([TWEENS]);
      cachedWorld = world;
    }
    const dt = context.time.dt;
    for (const entityId of query!.run()) {
      advanceEntityTweens(world, entityId, dt);
    }
  };

  return { name, frameUpdate };
}

export function advanceEntityTweens(world: World, entityId: EntityId, dt: number): void {
  const tweens = world.getComponent<TweenSpec[]>(entityId, TWEENS);
  if (tweens === undefined || tweens.length === 0) return;

  const next: TweenSpec[] = [];
  // Group writes per (component, property) — last write wins, so a later
  // tween overrides an earlier one targeting the same field. Track them
  // in a flat list to keep deterministic order.
  const writes: Array<{ component: ComponentName; property: string; value: number | number[] }> = [];

  for (const tween of tweens) {
    const duration = tween.duration;
    if (!(duration > 0)) continue;
    const ease = tween.ease ?? "linear";
    const loop = tween.loop ?? "none";
    let elapsed = (tween.elapsed ?? 0) + dt;
    let from = tween.from;
    let to = tween.to;
    let done = false;

    if (elapsed >= duration) {
      if (loop === "loop") {
        elapsed = elapsed % duration;
      } else if (loop === "ping-pong") {
        const cycles = Math.floor(elapsed / duration);
        elapsed = elapsed - cycles * duration;
        if (cycles % 2 === 1) {
          // odd → swap from/to and continue
          const tmp = from;
          from = to;
          to = tmp;
        }
      } else {
        elapsed = duration;
        done = true;
      }
    }

    const t = Math.max(0, Math.min(1, elapsed / duration));
    const eased = easeFn(ease, t);
    writes.push({
      component: tween.component,
      property: tween.property,
      value: lerpValue(from, to, eased)
    });

    if (!done) {
      next.push({ ...tween, from, to, elapsed });
    }
  }

  for (const write of writes) {
    const current = world.getComponent<Record<string, unknown>>(entityId, write.component);
    if (current === undefined) continue;
    world.setComponent(entityId, write.component, {
      ...current,
      [write.property]: write.value
    });
  }

  if (next.length === 0) {
    world.removeComponent(entityId, TWEENS);
  } else if (next.length !== tweens.length || next.some((tween, i) => tween.elapsed !== tweens[i]?.elapsed)) {
    world.setComponent(entityId, TWEENS, next);
  }
}
