// S82 KABOOM-DAMAGE-AND-DEATH (RoundResolveSystem half) + KABOOM-RESTART.
//
// Two concerns wired through a singleton `RoundState` entity:
//   1. Watch all BomberStats-carrying entities each frame; flip
//      `RoundState.phase` to 'won' / 'lost' / 'draw' when ≤ 1 bombers
//      remain alive. Also tracks `elapsed` for the HUD timer.
//   2. Pause every GridMover (clear queuedDirection) when phase
//      leaves 'playing' so the world freezes.
//   3. Consume `RoundRestartRequest` transients and apply a
//      `scene.load` command against the supplied start scene — that's
//      KABOOM-RESTART. Wired as a callback so the bootstrap stays in
//      charge of where the scene comes from.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const ROUND_STATE: ComponentName = "RoundState";
const ROUND_RESTART_REQUEST: ComponentName = "RoundRestartRequest";
const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_MOVER: ComponentName = "GridMover";

const SINGLETON_ID: EntityId = "kaboom.round-state";

type Tally = { player: number; bot: number; draws: number };

type RoundState = {
  phase: "playing" | "won" | "lost" | "draw";
  winnerId?: EntityId;
  elapsed?: number;
  roundNumber?: number;
  tally?: Tally;
};

type BomberStats = { alive?: boolean };

type GridMoverComponent = {
  speed: number;
  queuedDirection?: { dx: number; dz: number };
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};

export type RoundResolveSystemOptions = {
  /** Called when a RoundRestartRequest is consumed OR after `autoRestartAfterMs` elapses post-round. Host wires this to runtime.applyCommands([{ kind: "scene.load", scene }]). */
  onRestart?: () => void;
  /** Local player id — used to decide 'won' vs 'lost' phase. Defaults to "player.1". */
  playerId?: EntityId;
  /** ms to wait after the round ends (won/lost/draw) before firing onRestart automatically. 0 disables. Default 3000. */
  autoRestartAfterMs?: number;
  name?: string;
};

export function createKaboomRoundResolveSystem(options: RoundResolveSystemOptions = {}): System {
  const name = options.name ?? "kaboom.round-resolve";
  const playerId = options.playerId ?? "player.1";
  const autoRestartAfterMs = options.autoRestartAfterMs ?? 3000;

  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;
  let restartRequests: QueryHandle | undefined;
  let movers: QueryHandle | undefined;
  // Wallclock-style timer (ticks via context.time.dt) that accumulates only
  // while the round is NOT in 'playing'. RoundState.elapsed stops when the
  // round ends, so we cannot reuse it for the auto-restart delay.
  let endedMs = 0;
  let restartFired = false;

  function ensureRoundState(world: World): void {
    if (!world.hasEntity(SINGLETON_ID)) {
      world.addEntity(SINGLETON_ID);
      world.setComponent(SINGLETON_ID, ROUND_STATE, { phase: "playing", elapsed: 0 });
    } else if (!world.hasComponent(SINGLETON_ID, ROUND_STATE)) {
      world.setComponent(SINGLETON_ID, ROUND_STATE, { phase: "playing", elapsed: 0 });
    }
  }

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS]);
      restartRequests = world.createQuery([ROUND_RESTART_REQUEST]);
      movers = world.createQuery([GRID_MOVER]);
      cachedWorld = world;
      // World was swapped (scene.load fired) — reset post-round timers.
      endedMs = 0;
      restartFired = false;
    }
    ensureRoundState(world);
    const state = world.getComponent<RoundState>(SINGLETON_ID, ROUND_STATE) as RoundState;

    // Handle restart requests first. R while playing is a no-op so the
    // player doesn't accidentally reset mid-round; R after the round
    // has ended fires the host-supplied restart callback.
    for (const id of restartRequests!.run()) {
      world.removeComponent(id, ROUND_RESTART_REQUEST);
      if (state.phase !== "playing" && options.onRestart !== undefined && !restartFired) {
        restartFired = true;
        options.onRestart();
        return; // host will replace the world; further work is moot
      }
    }

    // Tick elapsed when playing.
    if (state.phase === "playing") {
      endedMs = 0;
      restartFired = false;
      const next: RoundState = { ...state, elapsed: (state.elapsed ?? 0) + Math.max(0, context.time.dt) };
      world.setComponent(SINGLETON_ID, ROUND_STATE, next);

      // Resolve win/loss: count alive bombers.
      const alive: EntityId[] = [];
      for (const id of bombers!.run()) {
        const stats = world.getComponent<BomberStats>(id, BOMBER_STATS);
        if (stats !== undefined && stats.alive !== false) alive.push(id);
      }
      if (alive.length === 1) {
        const winner = alive[0]!;
        const phase = winner === playerId ? "won" : "lost";
        // S84 KABOOM-SCORING-HUD. Bump the appropriate tally counter
        // when the phase resolves — the bootstrap reads the tally
        // out of the world before scene.load and seeds the same
        // numbers into the new RoundState so the count survives the
        // wipe.
        const tally: Tally = next.tally ?? { player: 0, bot: 0, draws: 0 };
        const bumped: Tally =
          phase === "won"
            ? { ...tally, player: tally.player + 1 }
            : { ...tally, bot: tally.bot + 1 };
        world.setComponent(SINGLETON_ID, ROUND_STATE, { ...next, phase, winnerId: winner, tally: bumped });
      } else if (alive.length === 0) {
        const tally: Tally = next.tally ?? { player: 0, bot: 0, draws: 0 };
        const bumped: Tally = { ...tally, draws: tally.draws + 1 };
        world.setComponent(SINGLETON_ID, ROUND_STATE, { ...next, phase: "draw", tally: bumped });
      }
    } else {
      // Round is over: freeze GridMover so motion stops without
      // deleting the entities (they stay visible for the win banner).
      for (const id of movers!.run()) {
        const mover = world.getComponent<GridMoverComponent>(id, GRID_MOVER);
        if (mover === undefined) continue;
        if (mover.queuedDirection !== undefined && (mover.queuedDirection.dx !== 0 || mover.queuedDirection.dz !== 0)) {
          world.setComponent(id, GRID_MOVER, { ...mover, queuedDirection: { dx: 0, dz: 0 } });
        }
      }
      // Auto-restart after configured delay so the round loops without
      // the player having to press R. The previous gap (R-only restart)
      // made the game look frozen after win/loss.
      if (!restartFired && autoRestartAfterMs > 0 && options.onRestart !== undefined) {
        endedMs += Math.max(0, context.time.dt) * 1000;
        if (endedMs >= autoRestartAfterMs) {
          restartFired = true;
          options.onRestart();
          return;
        }
      }
    }
  };

  return { name, frameUpdate };
}
