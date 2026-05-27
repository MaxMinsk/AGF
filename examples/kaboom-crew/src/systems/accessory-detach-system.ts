// S162 KABOOM-ACCESSORY-DETACH (GDP-2026-05-27-012).
//
// On bomber death (BomberStats.alive=false) the system identifies the
// dying bomber's accessory entities (id-prefix scan over
// `<rootId>.accessoryN.<kind>`), detaches each from its mount-socket
// parent, and stamps an AccessoryDebris component carrying scatter
// velocity / spin / lifetime. A second pass advances each
// AccessoryDebris entity each fixedUpdate — kinematic integration,
// gravity, mid-flight spin, opacity tween in the final fadeMs window,
// and removeEntity on lifetime expiry.
//
// This is a presentation-only effect; no Rapier bodies, no gameplay
// collision. The GDP's full Rapier-rigid-body integration stays a
// follow-up for the engine ragdoll module. The kinematic version
// reads "stuff explodes off" plenty well at the death-window scale
// (1.5 s, 5 accessories per bomber max).

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const BOMBER_STATS: ComponentName = "BomberStats";
const DEATH_IMPULSE: ComponentName = "DeathImpulse";
const ACCESSORY_DEBRIS: ComponentName = "AccessoryDebris";
const ACCESSORY_DETACH_FIRED: ComponentName = "AccessoryDetachFired";
const TRANSFORM: ComponentName = "Transform";
const GRID_POSITION: ComponentName = "GridPosition";
const SOFT_ATTACHED: ComponentName = "SoftAttached";
const SPRING_PIVOT: ComponentName = "SpringPivot";

// S162 follow-up (live playtest 2026-05-27 "accessories fly too far") —
// halved the impulse magnitudes + dropped lifetime 1500→1000ms so
// debris settles within the bomber's tile-radius rather than sailing
// across the arena. Determinism is unaffected (hash + config produce
// identical impulses; only the magnitudes shrank).
const DEFAULT_LIFETIME_MS = 1000;
const DEFAULT_FADE_MS = 250;
const DEFAULT_GRAVITY = 12;

export type AccessoryKind = "antennae" | "visor" | "backpack" | "cap" | "fins";

/**
 * Per-accessory scatter tuning. The system applies these to compute
 * a deterministic-per-(rootId, kind) impulse vector at detach time.
 */
export type AccessoryScatterConfig = {
  /** Up-bias in cells/sec. */
  verticalBias: number;
  /** Random horizontal spread radius (radians around blast direction). */
  horizontalSpread: number;
  /** -1..1 — negative = away from blast, positive = with blast. */
  bombDirectionalBias: number;
  /** Base velocity magnitude in cells/sec. */
  speedMagnitude: number;
  /** Rotation rate (deg/sec) — applied to all 3 axes randomly. */
  spinDegPerSec: number;
  /** Lifetime in ms (default 1500). */
  lifetimeMs?: number;
};

export const DEFAULT_ACCESSORY_SCATTER: Record<AccessoryKind, AccessoryScatterConfig> = {
  antennae: { verticalBias: 1.4, horizontalSpread: 1.0, bombDirectionalBias: 0.2, speedMagnitude: 1.4, spinDegPerSec: 540 },
  visor: { verticalBias: 0.2, horizontalSpread: 0.4, bombDirectionalBias: 0.1, speedMagnitude: 0.8, spinDegPerSec: 240 },
  backpack: { verticalBias: 0.5, horizontalSpread: 0.3, bombDirectionalBias: -0.7, speedMagnitude: 1.2, spinDegPerSec: 200 },
  cap: { verticalBias: 1.6, horizontalSpread: 0.4, bombDirectionalBias: 0.0, speedMagnitude: 1.6, spinDegPerSec: 360 },
  fins: { verticalBias: 0.3, horizontalSpread: 1.2, bombDirectionalBias: 0.3, speedMagnitude: 1.1, spinDegPerSec: 180 }
};

type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};

type DebrisState = {
  vx: number;
  vy: number;
  vz: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  elapsedMs: number;
  lifetimeMs: number;
  fadeMs?: number;
  gravity?: number;
};

/**
 * Deterministic 32-bit hash of (rootId, accessoryKind). Used to seed
 * the per-accessory random component so the same death produces the
 * same scatter pattern across runs (replay fixtures stay reproducible).
 */
export function scatterSeedHash(rootId: string, accessoryKind: string): number {
  let h = 2166136261 >>> 0;
  const s = `${rootId}|${accessoryKind}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * Pure helper — compute scatter velocity for one accessory given the
 * blast direction (unit vector pointing FROM blast TO bomber), the
 * accessory's scatter config, and a deterministic hash. Returns
 * {vx, vy, vz, spinX, spinY, spinZ} in cells/sec and deg/sec.
 */
export function computeScatterImpulse(
  blastDirX: number,
  blastDirZ: number,
  config: AccessoryScatterConfig,
  seed: number
): { vx: number; vy: number; vz: number; spinX: number; spinY: number; spinZ: number } {
  // Map seed to 4 pseudo-random unit-ish numbers — bias each axis
  // independently. Seed is 32-bit, mixed with simple xorshift per axis.
  const r0 = mulberryNext(seed);
  const r1 = mulberryNext(seed + 0x9e3779b9);
  const r2 = mulberryNext(seed + 0x517cc1b7);
  const r3 = mulberryNext(seed + 0x85ebca6b);

  // Self-bomb edge: blast direction is zero → ignore directional bias.
  const blastMag = Math.sqrt(blastDirX * blastDirX + blastDirZ * blastDirZ);
  const blastUnitX = blastMag > 1e-6 ? blastDirX / blastMag : 0;
  const blastUnitZ = blastMag > 1e-6 ? blastDirZ / blastMag : 0;

  // Direction-with-spread: take the blast unit and rotate it by a
  // random angle in [-horizontalSpread, +horizontalSpread] around Y.
  const spreadAngle = (r0 * 2 - 1) * config.horizontalSpread;
  const cosA = Math.cos(spreadAngle);
  const sinA = Math.sin(spreadAngle);
  const dirX = blastUnitX * cosA - blastUnitZ * sinA;
  const dirZ = blastUnitX * sinA + blastUnitZ * cosA;

  const horizontalSpeed = config.speedMagnitude * Math.abs(config.bombDirectionalBias);
  const vx = dirX * horizontalSpeed * Math.sign(config.bombDirectionalBias || 0);
  const vz = dirZ * horizontalSpeed * Math.sign(config.bombDirectionalBias || 0);

  // When bombDirectionalBias is zero, add a random horizontal kick.
  const randomKickX = (r1 * 2 - 1) * config.speedMagnitude * 0.5;
  const randomKickZ = (r2 * 2 - 1) * config.speedMagnitude * 0.5;

  const finalVx = vx + (config.bombDirectionalBias === 0 ? randomKickX : 0);
  const finalVz = vz + (config.bombDirectionalBias === 0 ? randomKickZ : 0);
  const vy = config.verticalBias * config.speedMagnitude;

  // Spin — uniform per axis, signed by mixed bits of the seed.
  const spinX = config.spinDegPerSec * (r3 * 2 - 1);
  const spinY = config.spinDegPerSec * (r0 * 2 - 1);
  const spinZ = config.spinDegPerSec * (r1 * 2 - 1);

  return { vx: finalVx, vy, vz: finalVz, spinX, spinY, spinZ };
}

/** Tiny seeded RNG — mulberry32. Returns 0..1. Deterministic per seed. */
function mulberryNext(seed: number): number {
  let s = (seed + 0x6d2b79f5) >>> 0;
  s = Math.imul(s ^ (s >>> 15), s | 1) >>> 0;
  s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
  return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
}

export type KaboomAccessoryDetachSystemOptions = {
  name?: string;
  scatter?: Record<AccessoryKind, AccessoryScatterConfig>;
  /** Ids treated as bomber root entities. Defaults to a heuristic: BomberStats holder. */
  isBomberRoot?: (entityId: EntityId) => boolean;
};

const ACCESSORY_ID_RE = /^(.+)\.accessory(\d+)\.([a-z-]+)$/;

export function createKaboomAccessoryDetachSystem(options: KaboomAccessoryDetachSystemOptions = {}): System {
  const name = options.name ?? "kaboom.accessory-detach";
  const scatter = options.scatter ?? DEFAULT_ACCESSORY_SCATTER;
  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;
  let debris: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS]);
      debris = world.createQuery([ACCESSORY_DEBRIS, TRANSFORM]);
      cachedWorld = world;
    }
    const dtMs = Math.max(0, context.time.fixedDt) * 1000;
    const dt = dtMs / 1000;

    // 1. Detach pass — for each newly-dead bomber that hasn't fired
    // accessory detach yet, walk its accessory ids + spawn debris.
    for (const rootId of bombers!.run()) {
      const stats = world.getComponent<{ alive?: boolean }>(rootId, BOMBER_STATS);
      if (stats === undefined || stats.alive !== false) continue;
      if (world.hasComponent(rootId, ACCESSORY_DETACH_FIRED)) continue;
      // Find blast direction from DeathImpulse if available.
      let blastDirX = 0;
      let blastDirZ = 0;
      const death = world.getComponent<{ blastOriginGx: number; blastOriginGz: number }>(rootId, DEATH_IMPULSE);
      const bomberPos = world.getComponent<{ gx: number; gz: number }>(rootId, GRID_POSITION);
      if (death !== undefined && bomberPos !== undefined) {
        blastDirX = bomberPos.gx - death.blastOriginGx;
        blastDirZ = bomberPos.gz - death.blastOriginGz;
      }
      // Find all accessory entities tagged to this bomber.
      const prefix = `${rootId}.accessory`;
      for (const eid of world.entityIds()) {
        if (!eid.startsWith(prefix)) continue;
        const m = ACCESSORY_ID_RE.exec(eid);
        if (m === null) continue;
        const kindRaw = m[3] as string;
        const kind = isAccessoryKind(kindRaw) ? kindRaw : undefined;
        if (kind === undefined) continue;
        const cfg = scatter[kind];
        const seed = scatterSeedHash(rootId, kind);
        const impulse = computeScatterImpulse(blastDirX, blastDirZ, cfg, seed);
        // Detach from parent — clear Transform.parent so further parent-
        // transform composition stops affecting this entity. Anchor at
        // the bomber's current world position + a small upward offset
        // (~head height) so the accessory starts the scatter from where
        // it visibly sits on the bomber instead of teleporting to the
        // rest-pose sum (which the animation system was offsetting away
        // from at the death frame).
        const transform = world.getComponent<TransformLike>(eid, TRANSFORM);
        const bomberTransform = world.getComponent<TransformLike>(rootId, TRANSFORM);
        if (transform !== undefined && bomberTransform?.position !== undefined) {
          const headOffset = kind === "backpack" ? 0.5 : kind === "fins" ? 0.5 : 1.0;
          const bp = bomberTransform.position;
          world.setComponent(eid, TRANSFORM, {
            position: [bp[0] ?? 0, (bp[1] ?? 0.4) + headOffset, bp[2] ?? 0] as [number, number, number],
            rotation: (transform.rotation ?? [0, 0, 0]) as [number, number, number],
            scale: (transform.scale ?? [1, 1, 1]) as [number, number, number]
            // parent intentionally omitted — now world-root.
          });
        }
        // Stop spring-sway interference.
        if (world.hasComponent(eid, SOFT_ATTACHED)) world.removeComponent(eid, SOFT_ATTACHED);
        if (world.hasComponent(eid, SPRING_PIVOT)) world.removeComponent(eid, SPRING_PIVOT);
        world.setComponent(eid, ACCESSORY_DEBRIS, {
          vx: impulse.vx,
          vy: impulse.vy,
          vz: impulse.vz,
          spinX: impulse.spinX,
          spinY: impulse.spinY,
          spinZ: impulse.spinZ,
          elapsedMs: 0,
          lifetimeMs: cfg.lifetimeMs ?? DEFAULT_LIFETIME_MS,
          fadeMs: DEFAULT_FADE_MS,
          gravity: DEFAULT_GRAVITY
        } satisfies DebrisState);
      }
      world.setComponent(rootId, ACCESSORY_DETACH_FIRED, {});
    }

    // 2. Debris integration pass — for each AccessoryDebris, advance
    // position by velocity, apply gravity, tween scale in fade window,
    // remove on lifetime expiry.
    const toDelete: EntityId[] = [];
    for (const eid of debris!.run()) {
      const state = world.getComponent<DebrisState>(eid, ACCESSORY_DEBRIS);
      const transform = world.getComponent<TransformLike>(eid, TRANSFORM);
      if (state === undefined || transform === undefined) continue;
      const elapsed = (state.elapsedMs ?? 0) + dtMs;
      const lifetime = state.lifetimeMs ?? DEFAULT_LIFETIME_MS;
      if (elapsed >= lifetime) {
        toDelete.push(eid);
        continue;
      }
      const gravity = state.gravity ?? DEFAULT_GRAVITY;
      const pos = transform.position ?? [0, 0.5, 0];
      const newVy = state.vy - gravity * dt;
      const newX = (pos[0] ?? 0) + state.vx * dt;
      const newY = Math.max(0, (pos[1] ?? 0) + state.vy * dt);
      const newZ = (pos[2] ?? 0) + state.vz * dt;
      const rot = transform.rotation ?? [0, 0, 0];
      const newRotX = (rot[0] ?? 0) + state.spinX * dt;
      const newRotY = (rot[1] ?? 0) + state.spinY * dt;
      const newRotZ = (rot[2] ?? 0) + state.spinZ * dt;
      // Fade — final fadeMs window shrinks scale toward 0.
      const fadeMs = state.fadeMs ?? DEFAULT_FADE_MS;
      const fadeT = Math.max(0, (lifetime - elapsed) / fadeMs);
      const baseScale = transform.scale ?? [1, 1, 1];
      // Cache original scale on first tick when not yet faded.
      const original = elapsed - dtMs <= 0 ? baseScale : baseScale;
      const targetScaleFactor = Math.min(1, fadeT);
      const sx = (original[0] ?? 1) * targetScaleFactor;
      const sy = (original[1] ?? 1) * targetScaleFactor;
      const sz = (original[2] ?? 1) * targetScaleFactor;

      world.setComponent(eid, TRANSFORM, {
        position: [newX, newY, newZ] as [number, number, number],
        rotation: [newRotX, newRotY, newRotZ] as [number, number, number],
        scale: [sx, sy, sz] as [number, number, number]
      });
      world.setComponent(eid, ACCESSORY_DEBRIS, {
        ...state,
        vy: newVy,
        elapsedMs: elapsed
      });
    }
    for (const eid of toDelete) world.removeEntity(eid);
  };

  return { name, fixedUpdate };
}

function isAccessoryKind(s: string): s is AccessoryKind {
  return s === "antennae" || s === "visor" || s === "backpack" || s === "cap" || s === "fins";
}

export const __ACCESSORY_DETACH_CONSTANTS = {
  DEFAULT_LIFETIME_MS,
  DEFAULT_FADE_MS,
  DEFAULT_GRAVITY
};
