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

const BOMB: ComponentName = "Bomb";
const BLAST_EVENT: ComponentName = "BlastEvent";
const GRID_POSITION: ComponentName = "GridPosition";
const BOMBER_STATS: ComponentName = "BomberStats";
const MESH_RENDERER: ComponentName = "MeshRenderer";

/**
 * S87 KABOOM-BOMB-COUNTDOWN-PULSE. Pure helper — returns the bomb
 * mesh colour for a given fuseRemaining. Pulse period scales linearly
 * with fuse time so the bomb effectively flashes faster as it ages.
 * Exported so unit tests can drive it without spinning the system.
 */
export function bombPulseColor(fuseRemaining: number): string {
  const t = Math.max(0, fuseRemaining);
  // Pulse period in seconds — clamped so the very-near-zero case stays
  // visible (~12 Hz) and the fresh-bomb case stays calm (~0.3 Hz at
  // fuseRemaining=2.5).
  const period = Math.max(0.08, t / 8);
  // A second-resolution clock against an arbitrary epoch is fine here
  // — pulse is purely cosmetic; replay determinism doesn't depend on
  // exact phase because the bomb mesh colour isn't snapshotted.
  const phase = (Date.now() / 1000) % period / period;
  // Triangle wave between 0 and 1 for a clean linear blend.
  const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  // Lerp #2a2a2a (dark grey) ↔ #ff5a2a (warm orange) in sRGB. We
  // sidestep colour-space gymnastics by interpolating channel-wise.
  const lerp = (a: number, b: number): number => Math.round(a + (b - a) * tri);
  const r = lerp(0x2a, 0xff);
  const g = lerp(0x2a, 0x5a);
  const b = lerp(0x2a, 0x2a);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

type BombComponent = { fuseRemaining: number; range: number; ownerId: EntityId };
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
    // Materialise the entity list — we'll mutate the world below and
    // don't want the live query iterator to throw on snapshot drift.
    const candidates = [...bombs!.run()];
    for (const entityId of candidates) {
      const bomb = world.getComponent<BombComponent>(entityId, BOMB);
      const pos = world.getComponent<GridPosition>(entityId, GRID_POSITION);
      if (bomb === undefined || pos === undefined) continue;
      const next = bomb.fuseRemaining - dt;
      if (next > 0) {
        world.setComponent(entityId, BOMB, { ...bomb, fuseRemaining: next });
        // S87 KABOOM-BOMB-COUNTDOWN-PULSE — paint the bomb mesh with a
        // pulse colour. Cheap per-frame component.set; renderer treats
        // colour as a uniform so this doesn't churn the geometry.
        const renderer = world.getComponent<{ mesh?: string; color?: string }>(entityId, MESH_RENDERER);
        if (renderer !== undefined) {
          const nextColor = bombPulseColor(next);
          if (renderer.color !== nextColor) {
            world.setComponent(entityId, MESH_RENDERER, { ...renderer, color: nextColor });
          }
        }
        continue;
      }
      // Detonate. Spawn a transient BlastEvent entity then delete the
      // bomb. BlastPropagationSystem consumes the event the same step.
      const eventId = nextEventId();
      if (!world.hasEntity(eventId)) {
        world.addEntity(eventId);
        world.setComponent(eventId, BLAST_EVENT, {
          originGx: pos.gx,
          originGz: pos.gz,
          range: bomb.range,
          ownerId: bomb.ownerId
        });
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
