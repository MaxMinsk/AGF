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

/** S268 — landing pop. Extra one-shot Y-squash that fires on the
 *  step-jump TRUE→FALSE edge so the touchdown reads as a real thud
 *  rather than the mirror-image of the takeoff. Amplitude decays as
 *  `(1-t)^2` over `LAND_POP_DURATION_S`. */
const LAND_POP_AMOUNT = 0.18;
const LAND_POP_DURATION_S = 0.12;

/** Pure helper — landing-pop Y-scale multiplier. t is elapsed/duration
 *  (clamped to [0, 1]). Returns 1 - amount × (1 - t)^2 so the pop is
 *  hardest at t=0 and gone by t=1. Exported for unit tests. */
export function landingPopScaleY(elapsedS: number, amount: number = LAND_POP_AMOUNT, durationS: number = LAND_POP_DURATION_S): number {
  if (elapsedS <= 0) return 1 - amount;
  if (elapsedS >= durationS) return 1;
  const t = elapsedS / durationS;
  const remaining = 1 - t;
  return 1 - amount * remaining * remaining;
}

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
  // S268 — per-bomber state for the landing pop. `prevStepJumping`
  // tracks whether the bomber was mid step-jump on the previous tick;
  // a true→false transition kicks off `landPopElapsedS` from 0. The
  // squash decays as (1 - t)^2 and the entry is dropped when elapsed
  // exceeds LAND_POP_DURATION_S.
  const prevStepJumping = new Map<EntityId, boolean>();
  const landPopElapsedS = new Map<EntityId, number>();
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
      prevStepJumping.clear();
      landPopElapsedS.clear();
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

    const dt = Math.max(0, context.time.fixedDt);
    for (const id of bombers!.run()) {
      liftOne(id);
      // S268 — detect the step-jump landing edge BEFORE applying the
      // squash so the squash function can read landPopElapsedS for
      // this entity in the same tick the pop starts.
      const stepJumping = isCurrentlyStepJumping(world, id);
      const wasJumping = prevStepJumping.get(id) ?? false;
      if (wasJumping && !stepJumping) {
        landPopElapsedS.set(id, 0);
      }
      prevStepJumping.set(id, stepJumping);
      // Advance the pop timer; drop when finished.
      const popElapsed = landPopElapsedS.get(id);
      if (popElapsed !== undefined) {
        const nextElapsed = popElapsed + dt;
        if (nextElapsed >= LAND_POP_DURATION_S) {
          landPopElapsedS.delete(id);
        } else {
          landPopElapsedS.set(id, nextElapsed);
        }
      }
      applyStepJumpSquash(world, id, authoredScale, landPopElapsedS.get(id));
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
    for (const id of [...prevStepJumping.keys()]) {
      if (!world.hasEntity(id)) prevStepJumping.delete(id);
    }
    for (const id of [...landPopElapsedS.keys()]) {
      if (!world.hasEntity(id)) landPopElapsedS.delete(id);
    }
  };

  return { name, fixedUpdate };
}

/** S268 — true when the bomber is mid-tween between two cells whose
 *  height delta is exactly 1. Shared between the edge detector + the
 *  squash function so they agree on the "step-jumping" predicate. */
function isCurrentlyStepJumping(world: World, entityId: EntityId): boolean {
  const mover = world.getComponent<GridMover>(entityId, GRID_MOVER);
  const pos = world.getComponent<GridPos>(entityId, GRID_POSITION);
  if (
    mover === undefined
    || pos?.gx === undefined
    || pos?.gz === undefined
    || typeof mover.targetGx !== "number"
    || typeof mover.targetGz !== "number"
    || typeof mover.currentLerp !== "number"
    || mover.currentLerp <= 0
    || mover.currentLerp >= 1
  ) return false;
  const fromH = getCellHeight(world, pos.gx, pos.gz);
  const toH = getCellHeight(world, mover.targetGx, mover.targetGz);
  return Math.abs(toH - fromH) === 1;
}

/** S182 — apply step-jump body squash to a bomber's Transform.scale.
 *  Y-scale dips by SQUASH_AMOUNT at the takeoff (t=0) and landing
 *  (t=1) ends of the arc, returning to 1 by t=SQUASH_WIDTH and again
 *  from t=1-SQUASH_WIDTH onward. X/Z scale compensate slightly so the
 *  volume reads as a squash rather than a shrink. Outside the
 *  step-jump window, restore the bomber's authored base scale.
 *
 *  S268 — when `landPopElapsedS` is defined, multiply the Y-scale by
 *  an additional landing-pop curve so the touchdown reads as a real
 *  thud rather than the mirror of the takeoff. */
function applyStepJumpSquash(
  world: World,
  entityId: EntityId,
  authoredScale: Map<EntityId, [number, number, number]>,
  landPopElapsedS: number | undefined
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
  // S268 — chain the landing-pop multiplier on top.
  if (landPopElapsedS !== undefined) {
    squashY *= landingPopScaleY(landPopElapsedS);
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
