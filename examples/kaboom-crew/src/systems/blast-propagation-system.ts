// S82 KABOOM-BOMB-FUSE-BLAST (propagation half) + KABOOM-DAMAGE-AND-DEATH.
//
// Consumes `BlastEvent` transients, walks the four cardinals from the
// origin cell up to `range` cells, and for each visited cell:
//   - spawns a short-lived `BlastTile` entity (visual + damage source)
//   - destroys any soft-block GridOccupant
//   - flips `BomberStats.alive=false` on any bomber present
//   - chains: if a Bomb sits on the cell, set its fuseRemaining=0 so
//     BombFuseSystem detonates it next step (or this step if it runs
//     after us — order is enforced by scheduler registration)
// Cardinals stop at the first cell that blocks blast (hard wall).
//
// BlastTile lifetime is handled by `kaboomBlastTileLifetimeSystem`
// (separate file) so each concern stays small. Total visual fade is
// ~0.4 s; that's also the damage window.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";
import { isPassableEdge } from "../../../../engine/grid/height-query";

const BLAST_EVENT: ComponentName = "BlastEvent";
const BOMB: ComponentName = "Bomb";
const BLAST_TILE: ComponentName = "BlastTile";
const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const GRID_POSITION: ComponentName = "GridPosition";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const BOMBER_STATS: ComponentName = "BomberStats";
const SOFT_BLOCK_DESTROYED_EVENT: ComponentName = "SoftBlockDestroyedEvent";
// S109 KABOOM-HIT-RECOIL — transient written by damageBombersAt when a
// blast lands on a shielded bomber. The hit-recoil-system consumes +
// removes it the same fixedUpdate it appears.
const HIT_RECOIL_REQUEST: ComponentName = "HitRecoilRequest";

type BlastEvent = { originGx: number; originGz: number; range: number; ownerId: EntityId; pierce?: boolean };
type BombComponent = { fuseRemaining: number; range: number; ownerId: EntityId; pierce?: boolean };
type GridPos = { gx: number; gz: number };
type Occupant = { layer?: string; blocksMovement?: boolean; blocksBlast?: boolean };

const DIRECTIONS: ReadonlyArray<{ dx: number; dz: number }> = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 }
];

const BLAST_TILE_LIFETIME = 0.4;

export type BlastPropagationSystemOptions = {
  occupancy: GridOccupancyQuery;
  name?: string;
  nextTileId?: (gx: number, gz: number) => EntityId;
  /** Counter base for `soft-block-destroyed.N` event ids — exposed for deterministic tests. */
  nextEventId?: (gx: number, gz: number) => EntityId;
};

export function createKaboomBlastPropagationSystem(options: BlastPropagationSystemOptions): System {
  const name = options.name ?? "kaboom.blast-propagation";
  let counter = 0;
  const nextTileId = options.nextTileId ?? ((gx: number, gz: number): EntityId => `blast-tile.${++counter}.${gx}.${gz}`);
  let eventCounter = 0;
  const nextEventId =
    options.nextEventId ??
    ((gx: number, gz: number): EntityId => `soft-block-destroyed.${++eventCounter}.${gx}.${gz}`);

  let cachedWorld: World | undefined;
  let events: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      events = world.createQuery([BLAST_EVENT]);
      cachedWorld = world;
    }
    // Snapshot the list — we'll add + remove entities below.
    const eventEntities = [...events!.run()];
    for (const eventId of eventEntities) {
      const event = world.getComponent<BlastEvent>(eventId, BLAST_EVENT);
      if (event === undefined) continue;

      // Origin cell always gets a tile + damage.
      spawnBlastTile(world, event.originGx, event.originGz, event.ownerId, nextTileId);
      damageBombersAt(world, options.occupancy, event.originGx, event.originGz, event.originGx, event.originGz);
      chainBombsAt(world, options.occupancy, event.originGx, event.originGz);
      // Soft blocks at origin (rare, but a bomb could land beside a wall
      // and immediately blow it up via chain) are destroyed too.
      destroySoftBlocksAt(world, options.occupancy, event.originGx, event.originGz, nextEventId);

      for (const direction of DIRECTIONS) {
        // S142 KABOOM-PIERCE-BOMB — per-direction pierce budget. Pierce
        // bombs walk through the FIRST soft block in each direction
        // (still destroying it); a second soft block stops the lane
        // normally. Hard blocks always stop pierce or not.
        let pierceBudget = event.pierce === true ? 1 : 0;
        for (let step = 1; step <= event.range; step += 1) {
          const gx = event.originGx + direction.dx * step;
          const gz = event.originGz + direction.dz * step;
          // S173 GDP-2026-05-28-010 — cliffs hard-stop the blast.
          // S174 GDP-2026-05-28-011 — Ramps suppress the cliff for the
          // pair they connect, so the blast walks through a ramp the
          // same way a bomber does. Check the step FROM the previous
          // cell TO the next cell. Walls / soft-blocks already stop the
          // lane below; the passability check is a peer check that
          // fires when the heights differ even on otherwise-passable
          // terrain.
          const prevGx = event.originGx + direction.dx * (step - 1);
          const prevGz = event.originGz + direction.dz * (step - 1);
          if (!isPassableEdge(world, prevGx, prevGz, gx, gz)) {
            break;
          }
          if (cellBlocksBlast(world, options.occupancy, gx, gz)) {
            // Still destroy the wall? Hard walls absorb the blast and
            // survive — Bomberman tradition. Soft blocks block blast
            // only after they take the hit, so handle them as a "stop
            // after destroy" pass below.
            const softHere = softBlockIdsAt(world, options.occupancy, gx, gz);
            if (softHere.length > 0) {
              // Soft block: spawn tile here, destroy the block, emit
              // SoftBlockDestroyedEvent so PickupSpawnSystem can roll
              // a pickup at this cell. Pierce-branch: if we still have
              // budget, continue past this cell after destroying.
              spawnBlastTile(world, gx, gz, event.ownerId, nextTileId);
              for (const id of softHere) world.removeEntity(id);
              emitSoftBlockDestroyed(world, gx, gz, nextEventId);
              if (pierceBudget > 0) {
                pierceBudget -= 1;
                continue;
              }
            } else {
              // S193 — hard wall absorbed the blast. Spawn a tiny ping
              // spark at the wall's edge so the player sees WHERE the
              // blast stopped, not just an arbitrary fade.
              spawnHardWallPing(world, gx, gz, direction.dx, direction.dz);
            }
            break;
          }
          spawnBlastTile(world, gx, gz, event.ownerId, nextTileId);
          damageBombersAt(world, options.occupancy, gx, gz, event.originGx, event.originGz);
          chainBombsAt(world, options.occupancy, gx, gz);
        }
      }
      // Event consumed.
      world.removeEntity(eventId);
    }
  };

  return { name, fixedUpdate };
}

function spawnBlastTile(
  world: World,
  gx: number,
  gz: number,
  ownerId: EntityId,
  nextId: (gx: number, gz: number) => EntityId
): void {
  const id = nextId(gx, gz);
  if (world.hasEntity(id)) return;
  world.addEntity(id);
  world.setComponent(id, TRANSFORM, {
    position: [gx, 0.1, gz],
    rotation: [0, 0, 0],
    scale: [0.9, 0.05, 0.9]
  });
  world.setComponent(id, MESH_RENDERER, { mesh: "box", color: "#ff9c42" });
  world.setComponent(id, GRID_POSITION, { gx, gz });
  world.setComponent(id, GRID_OCCUPANT, { layer: "blast", blocksMovement: false, blocksBlast: false });
  world.setComponent(id, BLAST_TILE, { lifetimeRemaining: BLAST_TILE_LIFETIME, ownerId });

  // S84 KABOOM-BLAST-PARTICLES. A short-lived 'spark' emitter co-spawned
  // with each blast tile. Single inline preset reuses the engine
  // ParticleEmitter primitive (M19); the emitter cleans itself up when
  // ParticleEmitter.elapsed >= lifetime.
  const emitterId = `${id}.spark`;
  if (!world.hasEntity(emitterId)) {
    world.addEntity(emitterId);
    world.setComponent(emitterId, TRANSFORM, {
      position: [gx, 0.4, gz],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    world.setComponent(emitterId, "ParticleEmitter", {
      preset: "spark",
      lifetime: 0.4,
      elapsed: 0,
      rate: 30,
      maxParticles: 12
    });
  }
}

function softBlockIdsAt(world: World, occupancy: GridOccupancyQuery, gx: number, gz: number): EntityId[] {
  const ids: EntityId[] = [];
  for (const id of occupancy.occupants(gx, gz)) {
    const occ = world.getComponent<Occupant>(id, GRID_OCCUPANT);
    if (occ === undefined) continue;
    // soft-block layer convention: blocksMovement=true, blocksBlast=false.
    if (occ.layer === "block" && occ.blocksMovement === true && occ.blocksBlast !== true) {
      ids.push(id);
    }
  }
  return ids;
}

function cellBlocksBlast(world: World, occupancy: GridOccupancyQuery, gx: number, gz: number): boolean {
  // Hard wall: blocksBlast=true at the cell stops the blast outright.
  if (occupancy.blocked(gx, gz, "blast")) return true;
  // Soft block: stops the blast AFTER absorbing it. Returning true and
  // letting the caller handle "destroy + stop" in one pass.
  return softBlockIdsAt(world, occupancy, gx, gz).length > 0;
}

function destroySoftBlocksAt(
  world: World,
  occupancy: GridOccupancyQuery,
  gx: number,
  gz: number,
  nextEventId: (gx: number, gz: number) => EntityId
): void {
  const ids = softBlockIdsAt(world, occupancy, gx, gz);
  if (ids.length === 0) return;
  for (const id of ids) world.removeEntity(id);
  emitSoftBlockDestroyed(world, gx, gz, nextEventId);
}

/** S193 — co-spawn a short-lived spark emitter at the wall's edge.
 *  Positioned ~0.5 cells toward the camera-facing side of the wall
 *  (`-dx, -dz` from cell centre) so the sparks read as bouncing off
 *  the impact face rather than emerging from inside the block. */
let hardWallPingCounter = 0;
function spawnHardWallPing(world: World, gx: number, gz: number, dx: number, dz: number): void {
  hardWallPingCounter += 1;
  const emitterId = `kaboom.hard-wall-ping.${hardWallPingCounter}.${gx}.${gz}`;
  world.addEntity(emitterId);
  world.setComponent(emitterId, TRANSFORM, {
    position: [gx - dx * 0.5, 0.4, gz - dz * 0.5],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent(emitterId, "ParticleEmitter", {
    preset: "spark",
    lifetime: 0.18,
    elapsed: 0,
    rate: 60,
    maxParticles: 8
  });
}

function emitSoftBlockDestroyed(
  world: World,
  gx: number,
  gz: number,
  nextEventId: (gx: number, gz: number) => EntityId
): void {
  const id = nextEventId(gx, gz);
  if (world.hasEntity(id)) return;
  world.addEntity(id);
  world.setComponent(id, SOFT_BLOCK_DESTROYED_EVENT, { gx, gz });
}

function damageBombersAt(
  world: World,
  occupancy: GridOccupancyQuery,
  gx: number,
  gz: number,
  blastOriginGx: number,
  blastOriginGz: number
): void {
  for (const id of occupancy.occupants(gx, gz)) {
    const stats = world.getComponent<{ alive?: boolean; maxBombs: number; range: number; activeBombs?: number; shield?: boolean }>(id, BOMBER_STATS);
    if (stats === undefined || stats.alive === false) continue;
    // S109 KABOOM-SHIELD-POWER-UP — consume a shield instead of dying.
    // The bomber stays alive, the shield flips to false, and we stamp a
    // HitRecoilRequest so the dedicated system can play the survival
    // tween (independent of ragdoll). DeathImpulse is NOT written —
    // ragdoll is owned by the death path. Multi-blast same fixedUpdate:
    // the shield absorbs the FIRST iteration (loop order = entity-id
    // ordered occupants); subsequent iterations see shield=false and
    // fall through to the kill branch.
    if (stats.shield === true) {
      world.setComponent(id, BOMBER_STATS, { ...stats, shield: false });
      world.setComponent(id, HIT_RECOIL_REQUEST, {
        blastOriginGx,
        blastOriginGz
      } satisfies HitRecoilRequestLike);
      continue;
    }
    world.setComponent(id, BOMBER_STATS, { ...stats, alive: false });
    // S105 KABOOM-RAGDOLL-STATE-COMPONENT — record the blast origin
    // that killed this bomber so the ragdoll system can apply a
    // direction-aware launch impulse. Multiple kills on the same frame
    // pile in via the magnitude clamp below — first writer wins on
    // origin (chain reactions are rare + the visual differs little).
    const existing = world.getComponent<DeathImpulseLike>(id, "DeathImpulse");
    if (existing === undefined) {
      world.setComponent(id, "DeathImpulse", {
        blastOriginGx,
        blastOriginGz,
        magnitude: 1.0
      } satisfies DeathImpulseLike);
    } else {
      world.setComponent(id, "DeathImpulse", {
        ...existing,
        magnitude: Math.min(1.8, (existing.magnitude ?? 1.0) + 0.4)
      });
    }
  }
}

type HitRecoilRequestLike = {
  blastOriginGx: number;
  blastOriginGz: number;
};

type DeathImpulseLike = {
  blastOriginGx: number;
  blastOriginGz: number;
  magnitude?: number;
};

function chainBombsAt(world: World, occupancy: GridOccupancyQuery, gx: number, gz: number): void {
  for (const id of occupancy.occupants(gx, gz, "bomb")) {
    const bomb = world.getComponent<BombComponent>(id, BOMB);
    if (bomb === undefined || bomb.fuseRemaining <= 0) continue;
    world.setComponent(id, BOMB, { ...bomb, fuseRemaining: 0 });
  }
}
