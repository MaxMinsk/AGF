// S104 KABOOM-BOMBER-ANIMATION-PROD + S104 KABOOM-REACH-IK-PLACE-BOMB.
//
// Watches each PlayerControlled / BotBrain bomber and writes
// BenchAnimationState.kind based on its current gameplay state:
//
//   - BomberStats.alive === false  → "none"          (DeathAnim owns the pose)
//   - just placed a bomb            → "reach"         (~0.4 s burst)
//   - GridMover currentLerp > 0     → "walk-swing"
//   - else                          → "idle-bob"
//
// The bench-animation-system from examples/procbomber-bench is the
// consumer: it reads BenchAnimationState + LimbPivots on the bomber
// root and drives the limb rotations.
//
// "Reach" bursts are gated by a per-entity timestamp stored inside the
// component (`reachEndsAt`). Each frame we check the time + revert to
// the computed kind once the burst window closes. The PlaceBombRequest
// transient is consumed by bomb-placement-system, so we read it here
// BEFORE that system runs (registered earlier in the scheduler order)
// AND track which entities have already had a burst this frame.

import type { World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { TimeContext } from "../../../../engine/core/loop/types";

import type { BenchAnimationKind } from "../../../procbomber-bench/src/systems/bench-animation-system";

const BENCH_ANIMATION_STATE = "BenchAnimationState";
const BOMBER_STATS = "BomberStats";
const GRID_MOVER = "GridMover";
const PLACE_BOMB_REQUEST = "PlaceBombRequest";
const PLAYER_CONTROLLED = "PlayerControlled";
const BOT_BRAIN = "BotBrain";
const DEATH_ANIM = "DeathAnim";

export const REACH_BURST_S = 0.4;

type BomberAnimationStateLike = {
  kind: BenchAnimationKind;
  elapsed?: number;
  armRestAngleRad?: number;
  upperArmLength?: number;
  forearmLength?: number;
  reachEndsAt?: number;
};

type BomberStatsLike = { alive?: boolean };
type GridMoverLike = { currentLerp?: number; queuedDirection?: { dx: number; dz: number } };

function decideKind(world: World, entityId: string, time: TimeContext, currentState: BomberAnimationStateLike | undefined): BenchAnimationKind {
  const stats = world.getComponent<BomberStatsLike>(entityId, BOMBER_STATS);
  if (stats?.alive === false) return "none";
  if (world.hasComponent(entityId, DEATH_ANIM)) return "none";

  // S104 KABOOM-REACH-IK-PLACE-BOMB. A burst started when the entity
  // last fired PlaceBombRequest; runs until reachEndsAt.
  if (currentState?.reachEndsAt !== undefined && currentState.reachEndsAt > time.elapsed) {
    return "reach";
  }

  const mover = world.getComponent<GridMoverLike>(entityId, GRID_MOVER);
  if (mover !== undefined) {
    if ((mover.currentLerp ?? 0) > 0) return "walk-swing";
    const queued = mover.queuedDirection;
    if (queued !== undefined && (queued.dx !== 0 || queued.dz !== 0)) return "walk-swing";
  }
  return "idle-bob";
}

export function createKaboomBomberAnimationDriverSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "kaboom.bomber-animation-driver";
  let cachedWorld: World | undefined;
  let playerQuery: ReturnType<World["createQuery"]> | undefined;
  let botQuery: ReturnType<World["createQuery"]> | undefined;

  return {
    name,
    fixedUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        playerQuery = world.createQuery([PLAYER_CONTROLLED, BOMBER_STATS]);
        botQuery = world.createQuery([BOT_BRAIN, BOMBER_STATS]);
        cachedWorld = world;
      }
      const time = context.time;
      const update = (entityId: string): void => {
        const existing = world.getComponent<BomberAnimationStateLike>(entityId, BENCH_ANIMATION_STATE);
        // S104 KABOOM-REACH-IK-PLACE-BOMB. A pending PlaceBombRequest
        // means the bomber is reaching THIS frame. The placement system
        // consumes the transient + adds it actively places the bomb;
        // we capture it here so the reach burst can run regardless of
        // whether placement succeeded.
        let reachEndsAt = existing?.reachEndsAt;
        if (world.hasComponent(entityId, PLACE_BOMB_REQUEST)) {
          reachEndsAt = time.elapsed + REACH_BURST_S;
        }
        const tentativeState: BomberAnimationStateLike | undefined =
          reachEndsAt !== undefined ? { ...(existing ?? { kind: "none" }), reachEndsAt } : existing;
        const kind = decideKind(world, entityId, time, tentativeState);
        const next: BomberAnimationStateLike = {
          kind,
          elapsed: existing?.elapsed ?? 0,
          armRestAngleRad: existing?.armRestAngleRad ?? 0,
          upperArmLength: existing?.upperArmLength ?? 0.2,
          forearmLength: existing?.forearmLength ?? 0.2,
          ...(reachEndsAt !== undefined ? { reachEndsAt } : {})
        };
        // Only write when something changed — avoids churning the
        // mutation counter every fixedUpdate.
        if (
          existing?.kind !== next.kind ||
          existing?.reachEndsAt !== next.reachEndsAt
        ) {
          world.setComponent(entityId, BENCH_ANIMATION_STATE, next);
        }
      };
      for (const id of playerQuery!.run()) update(id);
      for (const id of botQuery!.run()) update(id);
    }
  };
}
