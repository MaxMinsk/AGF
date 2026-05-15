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
// Pure ECS — no renderer / DOM access. Runs in `fixedUpdate` so replay
// reproduces the same elapsed values across runs.

import type { ComponentName, EntityId } from "../ecs/types";
import type { QueryHandle, World } from "../ecs/world";
import type { System, SystemContext } from "../systems/types";

export const TWEENS: ComponentName = "Tweens";

export type TweenEase = "linear" | "easeIn" | "easeOut" | "easeInOut" | "pulse";
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

function easeFn(kind: TweenEase | undefined, t: number): number {
  switch (kind) {
    case "easeIn":
      return t * t;
    case "easeOut":
      return 1 - (1 - t) * (1 - t);
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "pulse":
      // Sine half-wave — 0 at t=0, peak (1) at t=0.5, 0 at t=1. Lets a
      // one-shot tween animate base → peak → base and auto-remove on
      // completion. Useful for one-shot bounces / glints / damage flashes.
      return Math.sin(Math.PI * t);
    default:
      return t;
  }
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

  const fixedUpdate = (context: SystemContext): void => {
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

  return { name, fixedUpdate };
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
