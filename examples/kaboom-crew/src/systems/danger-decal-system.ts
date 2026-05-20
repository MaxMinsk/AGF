// S98 KABOOM-BLAST-DANGER-DECAL.
//
// Paints a translucent red overlay on every cell inside a bomb's
// projected blast radius — but only while the bomb's fuse is about
// to expire (< 1 s remaining). Gives the player a last-chance dodge
// signal that's distinct from the post-detonation BlastTile.
//
// Implementation: stable entity ids per cell (`danger.<gx>.<gz>`)
// so the system can `hasEntity`-check rather than carrying a side
// map. Each fixedUpdate computes the "should-be-on" cell set, then
// (1) spawns a DangerTile entity for missing cells, (2) removes
// DangerTile entities whose cell is no longer in the set. Uses the
// engine's Transform + MeshRenderer + GridPosition primitives —
// no new component schema, no renderer changes.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const BOMB: ComponentName = "Bomb";
const GRID_POSITION: ComponentName = "GridPosition";
const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const DANGER_TILE: ComponentName = "DangerTile";
const GRID_OCCUPANT: ComponentName = "GridOccupant";

type BombComponent = { range?: number; fuseRemaining?: number };
type GridPos = { gx: number; gz: number };
type Occupant = { layer?: string };

/** Cells inside a bomb's projected blast — same fan logic the blast
 *  propagation system uses, but stopping at hard-block occupants
 *  rather than movement-blockers (movement vs blast). */
const DIRECTIONS: ReadonlyArray<{ dx: number; dz: number }> = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 }
];

export type KaboomDangerDecalOptions = {
  name?: string;
  /** Bombs with fuseRemaining strictly less than this trigger the overlay. Default 1.0 s. */
  warningFuseSeconds?: number;
};

const DANGER_ID_PREFIX = "danger.";

function dangerIdFor(gx: number, gz: number): EntityId {
  return `${DANGER_ID_PREFIX}${gx}.${gz}`;
}

function isHardBlock(world: World, gx: number, gz: number): boolean {
  // The danger-decal system runs in fixedUpdate alongside other gameplay
  // systems. We avoid taking a dependency on the GridOccupancyQuery to
  // keep the system construction simple; instead we walk every entity
  // at (gx, gz) and check GridOccupant.layer === 'hard'. Cheap because
  // the cell-occupant set is small.
  // agf-allow: world.query — small arena scenarios; not a hot path.
  for (const id of world.query([GRID_POSITION, GRID_OCCUPANT])) {
    const pos = world.getComponent<GridPos>(id, GRID_POSITION);
    if (pos?.gx !== gx || pos?.gz !== gz) continue;
    const occ = world.getComponent<Occupant>(id, GRID_OCCUPANT);
    if (occ?.layer === "hard") return true;
  }
  return false;
}

export function createKaboomDangerDecalSystem(options: KaboomDangerDecalOptions = {}): System {
  const name = options.name ?? "kaboom.danger-decal";
  const warningFuseSeconds = options.warningFuseSeconds ?? 1.0;

  let cachedWorld: World | undefined;
  let bombs: QueryHandle | undefined;
  let dangerTiles: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombs = world.createQuery([BOMB, GRID_POSITION]);
      dangerTiles = world.createQuery([DANGER_TILE, GRID_POSITION]);
      cachedWorld = world;
    }

    // Compute the "should-be-on" set: every cell inside an imminent
    // bomb's projected blast.
    const shouldOn = new Set<string>();
    for (const id of bombs!.run()) {
      const bomb = world.getComponent<BombComponent>(id, BOMB);
      const pos = world.getComponent<GridPos>(id, GRID_POSITION);
      if (bomb === undefined || pos === undefined) continue;
      const fuseRemaining = bomb.fuseRemaining ?? Number.POSITIVE_INFINITY;
      if (fuseRemaining >= warningFuseSeconds) continue;
      const range = Math.max(0, bomb.range ?? 0);
      const center = `${pos.gx},${pos.gz}`;
      shouldOn.add(center);
      for (const dir of DIRECTIONS) {
        for (let step = 1; step <= range; step += 1) {
          const gx = pos.gx + dir.dx * step;
          const gz = pos.gz + dir.dz * step;
          if (isHardBlock(world, gx, gz)) break;
          shouldOn.add(`${gx},${gz}`);
        }
      }
    }

    // Spawn missing DangerTiles.
    for (const key of shouldOn) {
      const [gxStr, gzStr] = key.split(",");
      const gx = Number(gxStr);
      const gz = Number(gzStr);
      const id = dangerIdFor(gx, gz);
      if (world.hasEntity(id)) continue;
      world.addEntity(id);
      world.setComponent(id, TRANSFORM, {
        position: [gx, 0.06, gz],
        rotation: [0, 0, 0],
        // Slightly larger than a BlastTile (S082's [0.9, 0.05, 0.9]) so
        // the warning glows out past the cell edge.
        scale: [0.95, 0.04, 0.95]
      });
      world.setComponent(id, MESH_RENDERER, { mesh: "box", color: "#ff3a3a" });
      world.setComponent(id, GRID_POSITION, { gx, gz });
      world.setComponent(id, DANGER_TILE, {});
    }

    // Remove DangerTiles whose cell is no longer in the set.
    const toRemove: EntityId[] = [];
    for (const id of dangerTiles!.run()) {
      const pos = world.getComponent<GridPos>(id, GRID_POSITION);
      if (pos === undefined) {
        toRemove.push(id);
        continue;
      }
      if (!shouldOn.has(`${pos.gx},${pos.gz}`)) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) world.removeEntity(id);
  };

  return { name, fixedUpdate };
}
