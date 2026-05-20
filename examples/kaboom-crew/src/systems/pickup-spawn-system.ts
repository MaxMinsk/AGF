// S82 KABOOM-PICKUPS-AND-STATS (spawn half).
//
// Consumes `SoftBlockDestroyedEvent` transients emitted by
// BlastPropagationSystem. For each cleared cell, rolls a
// deterministic-by-cell RNG (seeded with `projectSeed ^ cellHash`) so
// the same arena always seeds the same pickups across runs — useful
// both for the agent control surface and for the planned bot-vs-bot
// regression test.
//
// Spawn probability is `dropChance` (default 0.3). When a pickup is
// rolled, one of three kinds is selected uniformly:
//   - bomb-up   (+1 BomberStats.maxBombs on pick-up)
//   - fire-up   (+1 BomberStats.range)
//   - speed-up  (+1 GridMover.speed)
// Each kind gets a distinct primitive shape + colour for at-a-glance
// reading on the arena floor — see `PICKUP_VISUAL` below.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { createSeededRng } from "../../../../engine/core/util/seeded-rng";

const SOFT_BLOCK_DESTROYED_EVENT: ComponentName = "SoftBlockDestroyedEvent";
const PICKUP: ComponentName = "Pickup";
const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const GRID_POSITION: ComponentName = "GridPosition";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const TWEENS: ComponentName = "Tweens";

// S095 KABOOM-SPAWN-POP-TWEEN — pickups grow with the same overshoot
// envelope as bombs (see bomb-placement-system).
const SPAWN_POP_DURATION_S = 0.2;

type SoftBlockDestroyedEvent = { gx: number; gz: number };
type PickupKind = "bomb-up" | "fire-up" | "speed-up";

type PickupVisual = {
  mesh: string;
  color: string;
  scale: [number, number, number];
  yOffset: number;
};

const PICKUP_VISUAL: Record<PickupKind, PickupVisual> = {
  // Round, slightly raised — reads as "collectible". Engine primitives
  // are box / sphere / cylinder / plane (see engine/core/primitives.ts);
  // anything else falls through to a placeholder and the mesh never
  // renders. Speed-up uses a tall, narrow cylinder so it reads
  // distinctly from the bomb-up sphere from a top-down camera.
  "bomb-up": { mesh: "sphere", color: "#5fa8ff", scale: [0.35, 0.35, 0.35], yOffset: 0.3 },
  "fire-up": { mesh: "box", color: "#ff7a36", scale: [0.45, 0.45, 0.45], yOffset: 0.28 },
  "speed-up": { mesh: "cylinder", color: "#7be35f", scale: [0.3, 0.5, 0.3], yOffset: 0.3 }
};

const PICKUP_KINDS: ReadonlyArray<PickupKind> = ["bomb-up", "fire-up", "speed-up"];

export type PickupSpawnSystemOptions = {
  name?: string;
  /** Project-wide salt mixed into the per-cell seed. Different seeds → different pickup layouts for the same arena. */
  seed?: number;
  /** Probability (0..1) that a destroyed soft block yields a pickup. Default 0.3 to keep the floor uncluttered. */
  dropChance?: number;
  /** Counter base for `pickup.N` entity ids — exposed for deterministic tests. */
  nextPickupId?: (gx: number, gz: number, kind: PickupKind) => EntityId;
};

function cellHash(gx: number, gz: number): number {
  // Cantor pairing-style mix; collisions don't matter for gameplay variance.
  return ((gx * 73856093) ^ (gz * 19349663)) >>> 0;
}

export function createKaboomPickupSpawnSystem(options: PickupSpawnSystemOptions = {}): System {
  const name = options.name ?? "kaboom.pickup-spawn";
  const seed = options.seed ?? 0xc0ffee;
  const dropChance = options.dropChance ?? 0.3;
  let counter = 0;
  const nextPickupId =
    options.nextPickupId ??
    ((gx: number, gz: number, kind: PickupKind): EntityId => `pickup.${kind}.${++counter}.${gx}.${gz}`);

  let cachedWorld: World | undefined;
  let events: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      events = world.createQuery([SOFT_BLOCK_DESTROYED_EVENT]);
      cachedWorld = world;
    }
    const eventIds = [...events!.run()];
    for (const eventId of eventIds) {
      const event = world.getComponent<SoftBlockDestroyedEvent>(eventId, SOFT_BLOCK_DESTROYED_EVENT);
      // Consume + remove first so an exception below doesn't loop us.
      world.removeEntity(eventId);
      if (event === undefined) continue;

      // Deterministic-by-cell roll. mulberry32 needs a non-zero seed;
      // createSeededRng handles the zero case internally.
      const rng = createSeededRng((seed ^ cellHash(event.gx, event.gz)) | 0);
      if (rng.next() >= dropChance) continue;
      const kind = rng.pick(PICKUP_KINDS);
      spawnPickup(world, event.gx, event.gz, kind, nextPickupId);
    }
  };

  return { name, fixedUpdate };
}

function spawnPickup(
  world: World,
  gx: number,
  gz: number,
  kind: PickupKind,
  nextId: (gx: number, gz: number, kind: PickupKind) => EntityId
): void {
  const id = nextId(gx, gz, kind);
  if (world.hasEntity(id)) return;
  const visual = PICKUP_VISUAL[kind];
  world.addEntity(id);
  world.setComponent(id, TRANSFORM, {
    position: [gx, visual.yOffset, gz],
    rotation: [0, 0, 0],
    scale: [0, 0, 0]
  });
  // S095 KABOOM-SPAWN-POP-TWEEN — scale 0 → final with easeOutBack.
  world.setComponent(id, TWEENS, [
    {
      component: TRANSFORM,
      property: "scale",
      from: [0, 0, 0],
      to: [visual.scale[0], visual.scale[1], visual.scale[2]],
      duration: SPAWN_POP_DURATION_S,
      ease: "easeOutBack"
    }
  ]);
  world.setComponent(id, MESH_RENDERER, { mesh: visual.mesh, color: visual.color });
  world.setComponent(id, GRID_POSITION, { gx, gz });
  // Layer "pickup" — does not block movement (bomber walks over it).
  world.setComponent(id, GRID_OCCUPANT, { layer: "pickup", blocksMovement: false, blocksBlast: false });
  world.setComponent(id, PICKUP, { kind });
}
