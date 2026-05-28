// S178 KABOOM-BOMBER-HEIGHT-LIFT — keep bomber/bomb/pickup Y in sync
// with the cell they're standing on. S173 lifted entities at SPAWN
// time via applyHeightmapCommands, but the engine grid-movement-system
// only tweens X/Z during cell-tween — it never writes Y. The result:
// a bomber walking off a plateau onto a flat cell kept the plateau's
// Y; a bomber walking up a ramp pair stayed at the first ramp's Y and
// clipped through the second ramp's mesh (user feedback
// 2026-05-28: "я хожу по 1 под тайлами которые на 2").
//
// This system runs each fixedUpdate. For every entity with a
// GridPosition + Transform that's NOT parented to another root, it
// resolves the cell's "stand-on" height (heightmap value for regular
// cells, midpoint for ramp cells matching the cell), writes
// Transform.position.y = authoredBaseY + standOnHeight.
//
// "authoredBaseY" is captured the first time the system sees the
// entity — it's whatever the spawn pipeline left Y at on the flat
// arena. Stored in a per-entity map so re-reading current Y
// (post-lift) doesn't compound.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { getCellHeight } from "../../../../engine/grid/height-query";

const TRANSFORM: ComponentName = "Transform";
const GRID_POSITION: ComponentName = "GridPosition";
const GRID_MOVER: ComponentName = "GridMover";
const BOMBER_STATS: ComponentName = "BomberStats";
const BOMB: ComponentName = "Bomb";
const PICKUP: ComponentName = "Pickup";

/** S181 — step-jump arc peak above the higher of (fromHeight,toHeight),
 *  in cell units. 0.4 reads as a clear hop without overshooting the
 *  camera's vertical budget. */
const STEP_JUMP_ARC_PEAK = 0.4;

/** S182 — step-jump body squash. Bomber's Y-scale dips at takeoff +
 *  landing windows of the arc so the hop reads as a real jump.
 *  Linearly ramps from `SQUASH_AMOUNT` at t=0 to 0 at t=`SQUASH_WIDTH`,
 *  symmetric at the landing end. Outside the windows scale stays 1. */
const SQUASH_AMOUNT = 0.12;
const SQUASH_WIDTH = 0.18;

type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};

type GridPos = { gx?: number; gz?: number };
type GridMover = { currentLerp?: number; targetGx?: number; targetGz?: number };

export function createKaboomBomberHeightLiftSystem(): System {
  const name = "kaboom.bomber-height-lift";
  // Authored Y per entity — captured on first sight, used as the base
  // we lift FROM. Stays in sync across rounds because scene-load wipes
  // entities and the map gets cleared via cachedWorld swap.
  const authoredBaseY = new Map<EntityId, number>();
  // S182 — authored Transform.scale per bomber, captured on first sight
  // so the step-jump squash modulates from the right baseline.
  const authoredScale = new Map<EntityId, [number, number, number]>();
  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;
  let bombs: QueryHandle | undefined;
  let pickups: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS, GRID_POSITION, TRANSFORM]);
      bombs = world.createQuery([BOMB, GRID_POSITION, TRANSFORM]);
      pickups = world.createQuery([PICKUP, GRID_POSITION, TRANSFORM]);
      cachedWorld = world;
      authoredBaseY.clear();
      authoredScale.clear();
    }

    const liftOne = (entityId: EntityId): void => {
      const transform = world.getComponent<TransformLike>(entityId, TRANSFORM);
      if (transform === undefined || transform.position === undefined) return;
      if (typeof transform.parent === "string" && transform.parent.length > 0) return;
      const pos = world.getComponent<GridPos>(entityId, GRID_POSITION);
      if (pos?.gx === undefined || pos?.gz === undefined) return;
      const standOn = standOnHeightAt(world, pos.gx, pos.gz, entityId);
      // Bombers have a BenchAnimationState driver that overwrites
      // Transform.position.y each fixedUpdate (idle bob + walk root
      // bob). Writing Transform directly would last one tick before
      // the animator clobbers it. Stamp HeightLift{offsetY} — the
      // bench-animation system adds it to its captured base.y so the
      // bob still oscillates around the elevated pose.
      const existing = world.getComponent<{ offsetY?: number }>(entityId, "HeightLift");
      if (existing?.offsetY !== standOn) {
        world.setComponent(entityId, "HeightLift", { offsetY: standOn });
      }
      // For entities without an animation driver (bombs, pickups),
      // also write Transform.position.y directly. The HeightLift
      // stamp above is harmless on them.
      if (world.hasComponent(entityId, "BenchAnimationState")) return;
      let base = authoredBaseY.get(entityId);
      if (base === undefined) {
        const currentY = transform.position[1] ?? 0;
        base = currentY - standOn;
        authoredBaseY.set(entityId, base);
      }
      const targetY = base + standOn;
      const [tx, ty, tz] = transform.position;
      if (Math.abs((ty ?? 0) - targetY) < 1e-4) return;
      world.setComponent(entityId, TRANSFORM, {
        ...transform,
        position: [tx, targetY, tz] as [number, number, number]
      });
    };

    for (const id of bombers!.run()) {
      liftOne(id);
      applyStepJumpSquash(world, id, authoredScale);
    }
    for (const id of bombs!.run()) liftOne(id);
    for (const id of pickups!.run()) liftOne(id);

    // GC: drop entries for entities that no longer exist.
    for (const id of [...authoredBaseY.keys()]) {
      if (!world.hasEntity(id)) authoredBaseY.delete(id);
    }
    for (const id of [...authoredScale.keys()]) {
      if (!world.hasEntity(id)) authoredScale.delete(id);
    }
  };

  return { name, fixedUpdate };
}

/** S182 — apply step-jump body squash to a bomber's Transform.scale.
 *  Y-scale dips by SQUASH_AMOUNT at the takeoff (t=0) and landing
 *  (t=1) ends of the arc, returning to 1 by t=SQUASH_WIDTH and again
 *  from t=1-SQUASH_WIDTH onward. X/Z scale compensate slightly so the
 *  volume reads as a squash rather than a shrink. Outside the
 *  step-jump window, restore the bomber's authored base scale. */
function applyStepJumpSquash(
  world: World,
  entityId: EntityId,
  authoredScale: Map<EntityId, [number, number, number]>
): void {
  const transform = world.getComponent<TransformLike>(entityId, TRANSFORM);
  if (transform === undefined || transform.scale === undefined) return;
  const currentScale = transform.scale;
  let base = authoredScale.get(entityId);
  if (base === undefined) {
    base = [
      currentScale[0] ?? 1,
      currentScale[1] ?? 1,
      currentScale[2] ?? 1
    ];
    authoredScale.set(entityId, base);
  }
  const mover = world.getComponent<GridMover>(entityId, GRID_MOVER);
  const pos = world.getComponent<GridPos>(entityId, GRID_POSITION);
  let squashY = 1;
  if (
    mover !== undefined &&
    pos?.gx !== undefined &&
    pos?.gz !== undefined &&
    typeof mover.targetGx === "number" &&
    typeof mover.targetGz === "number" &&
    typeof mover.currentLerp === "number" &&
    mover.currentLerp > 0 &&
    mover.currentLerp < 1
  ) {
    const fromH = getCellHeight(world, pos.gx, pos.gz);
    const toH = getCellHeight(world, mover.targetGx, mover.targetGz);
    if (Math.abs(toH - fromH) === 1) {
      const t = mover.currentLerp;
      const takeoff = Math.max(0, 1 - t / SQUASH_WIDTH);
      const landing = Math.max(0, 1 - (1 - t) / SQUASH_WIDTH);
      squashY = 1 - SQUASH_AMOUNT * Math.max(takeoff, landing);
    }
  }
  const stretch = 1 + (1 - squashY) * 0.5; // volume-preserving widen in X/Z
  const targetX = base[0] * stretch;
  const targetY = base[1] * squashY;
  const targetZ = base[2] * stretch;
  if (
    Math.abs((currentScale[0] ?? 1) - targetX) < 1e-4 &&
    Math.abs((currentScale[1] ?? 1) - targetY) < 1e-4 &&
    Math.abs((currentScale[2] ?? 1) - targetZ) < 1e-4
  ) {
    return;
  }
  world.setComponent(entityId, TRANSFORM, {
    ...transform,
    scale: [targetX, targetY, targetZ] as [number, number, number]
  });
}

/** S181 — resolve the entity's stand-on Y for the current tick.
 *  Mid-tween between two cells whose height differs by 1, the bomber
 *  arcs along a parabola peaking STEP_JUMP_ARC_PEAK cells above the
 *  higher of (fromHeight, toHeight). Outside of that window we fall
 *  back to the cell's static height (S179 heightmap-only model). */
function standOnHeightAt(world: World, gx: number, gz: number, entityId: EntityId): number {
  const cellH = getCellHeight(world, gx, gz);
  const mover = world.getComponent<GridMover>(entityId, GRID_MOVER);
  if (mover === undefined) return cellH;
  const { currentLerp, targetGx, targetGz } = mover;
  if (typeof targetGx !== "number" || typeof targetGz !== "number") return cellH;
  if (typeof currentLerp !== "number" || currentLerp <= 0 || currentLerp >= 1) return cellH;
  const toH = getCellHeight(world, targetGx, targetGz);
  if (Math.abs(toH - cellH) !== 1) return cellH;
  const t = currentLerp;
  const baseY = cellH + (toH - cellH) * t;
  const arcY = STEP_JUMP_ARC_PEAK * 4 * t * (1 - t);
  return baseY + arcY;
}
