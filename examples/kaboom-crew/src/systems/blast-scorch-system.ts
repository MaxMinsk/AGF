// S207 KABOOM-BLAST-SCORCH. After a blast resolves, paint a rounded
// '+' shape on the floor: one cylinder at the bomb origin, one
// segment (box) per direction the blast reached, and a cylinder at
// each end-of-reach cell. The cylinders soften the corners of a
// linear segment so the overall shape reads as a single soft scorch
// pattern instead of 5..9 individual painted tiles.
//
// Lifetime: ~2.2s, with Y-scale shrinking across the WHOLE window
// for a gentle continuous fade rather than a snap. Multiple blasts
// stack — repeated bombings in the same area visibly darken without
// being overpowering.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { getCellHeight } from "../../../../engine/grid/height-query";

const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const BLAST_SCORCH: ComponentName = "BlastScorch";

const SCORCH_LIFETIME_MS = 2200;
const SCORCH_FADE_MS = SCORCH_LIFETIME_MS;
const SCORCH_BASE_Y_SCALE = 0.035;
const SCORCH_BASE_XZ_SCALE = 0.78;
const SCORCH_Y_OFFSET = 0.015;
const SCORCH_HEX = "#3a2418";

type ScorchComponent = {
  elapsedMs?: number;
  lifetimeMs?: number;
  fadeMs?: number;
  baseYScale?: number;
};

export type ScorchReach = {
  /** Cell-count the blast travelled in each cardinal direction
   *  from the origin (0 = blast didn't go that way / blocked at +0).
   *  Origin tile itself isn't counted here. */
  east: number;
  west: number;
  north: number;
  south: number;
};

let counter = 0;

/** Spawn a rounded '+' scorch around `(originGx, originGz)`. */
export function spawnBlastScorchCross(
  world: World,
  originGx: number,
  originGz: number,
  reach: ScorchReach
): ReadonlyArray<EntityId> {
  const ids: EntityId[] = [];
  // Centre cylinder — even when reach is all zero (blast that hit
  // walls in every direction) the bomb cell still gets a mark.
  ids.push(spawnEndCylinder(world, originGx, originGz));
  // For each direction with > 0 reach, emit a connecting segment box
  // + an end cylinder at the far cell.
  if (reach.east > 0) {
    const endGx = originGx + reach.east;
    ids.push(spawnSegmentBox(world, originGx, originGz, endGx, originGz));
    ids.push(spawnEndCylinder(world, endGx, originGz));
  }
  if (reach.west > 0) {
    const endGx = originGx - reach.west;
    ids.push(spawnSegmentBox(world, originGx, originGz, endGx, originGz));
    ids.push(spawnEndCylinder(world, endGx, originGz));
  }
  if (reach.north > 0) {
    const endGz = originGz - reach.north;
    ids.push(spawnSegmentBox(world, originGx, originGz, originGx, endGz));
    ids.push(spawnEndCylinder(world, originGx, endGz));
  }
  if (reach.south > 0) {
    const endGz = originGz + reach.south;
    ids.push(spawnSegmentBox(world, originGx, originGz, originGx, endGz));
    ids.push(spawnEndCylinder(world, originGx, endGz));
  }
  return ids;
}

function spawnEndCylinder(world: World, gx: number, gz: number): EntityId {
  counter += 1;
  const id: EntityId = `kaboom.blast-scorch.cap.${counter}.${gx}.${gz}`;
  world.addEntity(id);
  const cellH = getCellHeight(world, gx, gz);
  world.setComponent(id, TRANSFORM, {
    position: [gx, cellH + SCORCH_Y_OFFSET, gz],
    rotation: [0, 0, 0],
    scale: [SCORCH_BASE_XZ_SCALE, SCORCH_BASE_Y_SCALE, SCORCH_BASE_XZ_SCALE]
  });
  world.setComponent(id, MESH_RENDERER, { mesh: "cylinder", color: SCORCH_HEX });
  world.setComponent(id, BLAST_SCORCH, {
    elapsedMs: 0,
    lifetimeMs: SCORCH_LIFETIME_MS,
    fadeMs: SCORCH_FADE_MS,
    baseYScale: SCORCH_BASE_Y_SCALE
  });
  return id;
}

function spawnSegmentBox(
  world: World,
  fromGx: number,
  fromGz: number,
  toGx: number,
  toGz: number
): EntityId {
  counter += 1;
  const midX = (fromGx + toGx) / 2;
  const midZ = (fromGz + toGz) / 2;
  const id: EntityId = `kaboom.blast-scorch.seg.${counter}.${midX}.${midZ}`;
  world.addEntity(id);
  const cellH = getCellHeight(world, Math.round(midX), Math.round(midZ));
  // Length along the axis that varies; width along the perpendicular
  // matches the cap cylinder diameter.
  const lenX = Math.abs(toGx - fromGx) + SCORCH_BASE_XZ_SCALE;
  const lenZ = Math.abs(toGz - fromGz) + SCORCH_BASE_XZ_SCALE;
  const scaleX = toGx === fromGx ? SCORCH_BASE_XZ_SCALE : lenX;
  const scaleZ = toGz === fromGz ? SCORCH_BASE_XZ_SCALE : lenZ;
  world.setComponent(id, TRANSFORM, {
    position: [midX, cellH + SCORCH_Y_OFFSET, midZ],
    rotation: [0, 0, 0],
    scale: [scaleX, SCORCH_BASE_Y_SCALE, scaleZ]
  });
  world.setComponent(id, MESH_RENDERER, { mesh: "box", color: SCORCH_HEX });
  world.setComponent(id, BLAST_SCORCH, {
    elapsedMs: 0,
    lifetimeMs: SCORCH_LIFETIME_MS,
    fadeMs: SCORCH_FADE_MS,
    baseYScale: SCORCH_BASE_Y_SCALE
  });
  return id;
}

export function createKaboomBlastScorchSystem(): System {
  const name = "kaboom.blast-scorch";
  let cachedWorld: World | undefined;
  let scorches: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      scorches = world.createQuery([BLAST_SCORCH, TRANSFORM]);
      cachedWorld = world;
    }
    const dtMs = Math.max(0, context.time.fixedDt) * 1000;
    const toRemove: EntityId[] = [];
    for (const id of scorches!.run()) {
      const sc = world.getComponent<ScorchComponent>(id, BLAST_SCORCH);
      if (sc === undefined) continue;
      const lifetime = sc.lifetimeMs ?? SCORCH_LIFETIME_MS;
      const fade = sc.fadeMs ?? SCORCH_FADE_MS;
      const base = sc.baseYScale ?? SCORCH_BASE_Y_SCALE;
      const elapsed = (sc.elapsedMs ?? 0) + dtMs;
      if (elapsed >= lifetime) {
        toRemove.push(id);
        continue;
      }
      const transform = world.getComponent<{
        position?: ReadonlyArray<number>;
        rotation?: ReadonlyArray<number>;
        scale?: ReadonlyArray<number>;
      }>(id, TRANSFORM);
      if (transform?.position === undefined || transform.scale === undefined) continue;
      const remaining = lifetime - elapsed;
      const fadeFactor = remaining < fade ? remaining / fade : 1;
      const [sx, , sz] = transform.scale;
      world.setComponent(id, TRANSFORM, {
        ...transform,
        scale: [
          sx ?? SCORCH_BASE_XZ_SCALE,
          base * fadeFactor,
          sz ?? SCORCH_BASE_XZ_SCALE
        ] as [number, number, number]
      });
      world.setComponent(id, BLAST_SCORCH, { ...sc, elapsedMs: elapsed });
    }
    for (const id of toRemove) world.removeEntity(id);
  };

  return { name, fixedUpdate };
}
