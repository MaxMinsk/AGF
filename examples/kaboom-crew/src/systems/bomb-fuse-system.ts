// S82 KABOOM-BOMB-FUSE-BLAST (fuse half).
//
// fixedUpdate ticks each `Bomb.fuseRemaining` down by fixedDt; at zero
// the bomb emits a `BlastEvent` transient component on a freshly-spawned
// event entity + deletes the bomb. BlastPropagationSystem consumes the
// event the same step.
//
// Chain reactions: another system (BlastPropagationSystem) sets a
// bomb's `fuseRemaining` to 0 when the bomb shares a cell with a
// blast tile — this system handles the actual detonation logic
// identically whether the fuse hit zero by timer or by chain.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { BOMB_FINAL_SCALE } from "./bomb-placement-system";
import { spawnPuff } from "./spawn-puff";

/** S270 — fuse value at which the bomb fires its one-shot critical
 *  pulse. The bomb is about to detonate in well under half a second;
 *  the cell pulses red so the player has a final "GET OUT" cue
 *  beyond the existing mesh wiggle + colour pulse, which can be
 *  hard to read in chaotic moments. */
const CRITICAL_PULSE_FUSE_THRESHOLD_S = 0.4;
const CRITICAL_PULSE_COLOR = "#ff3030";

const BOMB: ComponentName = "Bomb";
const BLAST_EVENT: ComponentName = "BlastEvent";
const GRID_POSITION: ComponentName = "GridPosition";
const BOMBER_STATS: ComponentName = "BomberStats";
const TRANSFORM: ComponentName = "Transform";
// S100 KABOOM-REMOTE-DETONATE-PUP — transient input on a bomber. We
// read + remove it at the top of each fixedUpdate, dropping the
// fuse on every paused bomb that bomber owns.
const REMOTE_DETONATE_REQUEST: ComponentName = "RemoteDetonateRequest";


/**
 * S90 KABOOM-BOMB-FUSE-WIGGLE. Per-frame Transform.scale modifier
 * for a bomb mesh. Returns a uniform scale ratio (1.0 = baseline).
 * Stays at 1 when fuseRemaining > 2 so a freshly-placed bomb sits
 * still. Below the threshold the wiggle ramps up: amplitude grows
 * as fuseRemaining drops, frequency rises so it strobes near zero.
 *
 * Pure helper — exported so unit tests can lock the curve shape
 * without spinning the system or stubbing Date.now.
 */
export function bombWiggleScale(fuseRemaining: number, now: number = Date.now()): number {
  const t = Math.max(0, fuseRemaining);
  if (t > 2) return 1;
  // Linear ramp 0 → 1 as fuseRemaining drops from 2 → 0.
  const urgency = 1 - t / 2;
  // S99 KABOOM-BOMB-FUSE-WIGGLE-TAME: halved the amplitudes from
  // (0.04 + 0.10 * urgency) → (0.02 + 0.05 * urgency). User reported
  // the previous wiggle was over-inflating the bomb visually. The
  // frequency ramp is unchanged so the strobe still reads as urgency;
  // only the size pulse is tamed.
  const amplitude = 0.02 + 0.05 * urgency;
  // Frequency: 4 Hz at fuse=2, ~12 Hz near zero.
  const frequency = 4 + 8 * urgency;
  const phase = (now / 1000) * frequency * Math.PI * 2;
  return 1 + Math.sin(phase) * amplitude;
}

type BombComponent = { fuseRemaining: number; range: number; ownerId: EntityId; pierce?: boolean; carriedBy?: EntityId; airborne?: boolean; chained?: boolean; criticalPulseFired?: boolean };
type GridPosition = { gx: number; gz: number };

export function createKaboomBombFuseSystem(options: { name?: string; nextEventId?: () => EntityId } = {}): System {
  const name = options.name ?? "kaboom.bomb-fuse";
  let counter = 0;
  const nextEventId = options.nextEventId ?? ((): EntityId => `blast-event.${++counter}`);

  let cachedWorld: World | undefined;
  let bombs: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombs = world.createQuery([BOMB, GRID_POSITION]);
      cachedWorld = world;
    }
    // S84 KABOOM-TITLE-SCREEN — fuses freeze while the round is paused.
    if (world.hasComponent("kaboom.game-state", "GamePaused")) return;
    const dt = Math.max(0, context.time.fixedDt);
    // S100 KABOOM-REMOTE-DETONATE-PUP — handle pending remote-detonate
    // requests BEFORE the fuse decrement so triggered bombs explode
    // this same fixedUpdate (rather than waiting a tick). For each
    // bomber carrying the request, drop fuseRemaining=0 on every
    // paused bomb they own; remove the request.
    const triggers: string[] = [];
    // agf-allow: world.query — runs at most ~once per player frame and only when the player presses F.
    for (const id of world.query([REMOTE_DETONATE_REQUEST])) triggers.push(id);
    if (triggers.length > 0) {
      const allBombs = [...bombs!.run()];
      for (const bomberId of triggers) {
        for (const bombId of allBombs) {
          const bomb = world.getComponent<BombComponent>(bombId, BOMB);
          if (bomb === undefined || bomb.ownerId !== bomberId) continue;
          if (Number.isFinite(bomb.fuseRemaining)) continue;
          world.setComponent(bombId, BOMB, { ...bomb, fuseRemaining: 0 });
        }
        world.removeComponent(bomberId, REMOTE_DETONATE_REQUEST);
      }
    }
    // Materialise the entity list — we'll mutate the world below and
    // don't want the live query iterator to throw on snapshot drift.
    const candidates = [...bombs!.run()];
    for (const entityId of candidates) {
      const bomb = world.getComponent<BombComponent>(entityId, BOMB);
      const pos = world.getComponent<GridPosition>(entityId, GRID_POSITION);
      if (bomb === undefined || pos === undefined) continue;
      // S100 KABOOM-REMOTE-DETONATE-PUP — paused bombs (fuseRemaining
       // = Infinity) don't tick; they sit until a RemoteDetonateRequest
       // drops their fuse to 0 above.
      if (!Number.isFinite(bomb.fuseRemaining)) {
        continue;
      }
      // S144 KABOOM-THROW-GLOVE — carried or airborne bombs pause the
      // fuse decrement. bomb-pickup-system sets carriedBy on pickup;
      // bomb-throw-system sets airborne for the 0.45s arc + clears
      // both on landing.
      if (typeof bomb.carriedBy === "string" || bomb.airborne === true) {
        continue;
      }
      const next = bomb.fuseRemaining - dt;
      if (next > 0) {
        // S270 — fire the critical-pulse red puff once, the first
        // tick the fuse crosses below CRITICAL_PULSE_FUSE_THRESHOLD_S.
        // Sticky `criticalPulseFired` flag avoids re-spawning every
        // frame between the threshold crossing and detonation.
        let firedCritical = bomb.criticalPulseFired === true;
        if (!firedCritical && next <= CRITICAL_PULSE_FUSE_THRESHOLD_S) {
          spawnPuff(world, {
            id: `${entityId}.critical-pulse`,
            position: [pos.gx, 0.5, pos.gz],
            preset: "spark",
            lifetime: 0.15,
            rate: 60,
            maxParticles: 16,
            color: CRITICAL_PULSE_COLOR
          });
          firedCritical = true;
        }
        world.setComponent(entityId, BOMB, { ...bomb, fuseRemaining: next, criticalPulseFired: firedCritical });
        // S90 KABOOM-BOMB-FUSE-WIGGLE. Modulate the bomb's
        // Transform.scale uniformly so the mesh visibly throbs as
        // the fuse runs down. Skipped when fuse > 2 — the helper
        // returns 1 and we still bypass the setComponent so we
        // don't churn the world's mutation counter.
        if (next <= 2) {
          const transform = world.getComponent<{ position?: ReadonlyArray<number>; rotation?: ReadonlyArray<number>; scale?: ReadonlyArray<number> }>(entityId, TRANSFORM);
          if (transform !== undefined) {
            // S99 KABOOM-BOMB-FUSE-WIGGLE-BASESCALE-FIX. bombWiggleScale
            // returns a UNIT-CENTERED multiplier (1.0 ± amplitude). The
            // bomb's resting scale is BOMB_FINAL_SCALE (0.35) — writing
            // the multiplier directly into Transform.scale balloons the
            // mesh from 0.35 to ~1.0 (≈ 3x). Multiply by the base scale
            // so the wiggle oscillates around the resting size.
            const ratio = bombWiggleScale(next);
            const base = BOMB_FINAL_SCALE[0] ?? 0.35;
            const s = base * ratio;
            world.setComponent(entityId, TRANSFORM, { ...transform, scale: [s, s, s] });
          }
        }
        continue;
      }
      // Detonate. Spawn a transient BlastEvent entity then delete the
      // bomb. BlastPropagationSystem consumes the event the same step.
      // S142 KABOOM-PIERCE-BOMB — copy bomb.pierce → BlastEvent.pierce
      // so the propagation step can branch on the pierce rule without
      // looking up the (already deleted) bomb entity.
      const eventId = nextEventId();
      if (!world.hasEntity(eventId)) {
        world.addEntity(eventId);
        const eventData: { originGx: number; originGz: number; range: number; ownerId: EntityId; pierce?: boolean; chained?: boolean } = {
          originGx: pos.gx,
          originGz: pos.gz,
          range: bomb.range,
          ownerId: bomb.ownerId
        };
        if (bomb.pierce === true) eventData.pierce = true;
        // S269 — propagate the chain-trigger flag so the blast-tile
        // spark uses the chain colour instead of the regular orange.
        if (bomb.chained === true) eventData.chained = true;
        world.setComponent(eventId, BLAST_EVENT, eventData);
      }
      // Decrement the owner's activeBombs counter so they can place more.
      const ownerStats = world.getComponent<{ activeBombs?: number; maxBombs: number; range: number }>(bomb.ownerId, BOMBER_STATS);
      if (ownerStats !== undefined && (ownerStats.activeBombs ?? 0) > 0) {
        world.setComponent(bomb.ownerId, BOMBER_STATS, {
          ...ownerStats,
          activeBombs: (ownerStats.activeBombs ?? 0) - 1
        });
      }
      world.removeEntity(entityId);
    }
  };

  return { name, fixedUpdate };
}
