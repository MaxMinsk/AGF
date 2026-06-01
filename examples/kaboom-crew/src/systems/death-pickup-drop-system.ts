// S208 KABOOM-LOOT-DROP (GDP-2026-05-30-001). When a bomber dies,
// drop ~half of their collected stats as pickups at the death cell so
// the survivor has a reason to ENGAGE rather than orbit. Survivors
// race to grab the loot before it vanishes (30 s default lifetime
// handled by a dedicated decay system below).
//
// Watches BomberStats.alive transitions (true → false) the same way
// kaboom.death-trigger does, then writes pickups via the
// shared `spawnKaboomPickup` helper. Drop count + boolean selection
// is deterministic per (bomberId, roundNumber, sceneSeed) so
// bot-vs-bot regressions stay reproducible.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { createSeededRng } from "../../../../engine/core/util/seeded-rng";

import { spawnKaboomPickup } from "./pickup-spawn-system";
import type { PickupKind } from "./pickup-spawn-system";

const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_POSITION: ComponentName = "GridPosition";
const PICKUP: ComponentName = "Pickup";
const LOOT_DROP_DECAY: ComponentName = "LootDropDecay";
const TRANSFORM: ComponentName = "Transform";

const ROUND_STATE_ID = "kaboom.round-state";
const ROUND_STATE: ComponentName = "RoundState";

/** Default seconds a dropped pickup lingers before despawning. */
export const LOOT_DROP_LIFETIME_S_DEFAULT = 30;
/** Hard cap on pickups spawned at a single death so a stacked-up
 *  bomber doesn't shower 12 items at once. */
export const LOOT_DROP_CAP_DEFAULT = 5;
/** Probability per boolean flag (kick / shield / pierce / …) that the
 *  bomber's flag drops on death. */
export const LOOT_DROP_BOOLEAN_RATIO_DEFAULT = 0.5;
/** Project-wide deterministic seed mixed into the drop RNG. */
export const LOOT_DROP_SEED_DEFAULT = 0x10a700d;

type BomberStatsComponent = {
  maxBombs?: number;
  range?: number;
  speed?: number;
  alive?: boolean;
  canKick?: boolean;
  remoteDetonateCharges?: number;
  shield?: boolean;
  pierce?: boolean;
  canThrow?: boolean;
  bombPass?: boolean;
};

type GridPositionComponent = { gx?: number; gz?: number };
type RoundStateComponent = { roundNumber?: number };

export type KaboomDeathPickupDropOptions = {
  name?: string;
  /** Disable all drops (URL `?lootDrop=off`). */
  disabled?: boolean;
  /** Override the per-boolean drop ratio. Clamped 0..1. */
  booleanRatio?: number;
  /** Override the per-death drop cap. */
  capPerDeath?: number;
  /** Override the persistence in seconds. */
  lifetimeS?: number;
  /** Project seed mixed into the deterministic drop RNG. */
  seed?: number;
};

/** Order in which drops are kept when the per-death cap clips the
 *  candidate list. Numerics first (most visible stat lift), then
 *  booleans by relative rarity inside the game. */
const DROP_PRIORITY: ReadonlyArray<PickupKind> = [
  "bomb-up",
  "fire-up",
  "speed-up",
  "shield",
  "pierce",
  "remote-detonate",
  "kick",
  "throw-glove",
  "bomb-pass"
];

/** Hash three integers into a non-zero seed for the per-death RNG. */
function dropSeed(bomberId: EntityId, roundNumber: number, projectSeed: number): number {
  let h = projectSeed | 0;
  for (let i = 0; i < bomberId.length; i += 1) {
    h = Math.imul(h ^ bomberId.charCodeAt(i), 0x01000193);
  }
  h = Math.imul(h ^ roundNumber, 0x01000193);
  return (h | 1) >>> 0;
}

/** Pure helper — given a snapshot of a bomber's stats, list the
 *  pickup kinds that should drop. Exported so tests + bots can
 *  inspect the rule directly. */
export function computeDropList(
  stats: BomberStatsComponent,
  rng: { next(): number },
  options: { booleanRatio: number; cap: number }
): ReadonlyArray<PickupKind> {
  const drops: PickupKind[] = [];
  // Numeric stats: drop floor((current - base) / 2). Base for
  // maxBombs + range is 1 (the schema minimum); base speed is 1 by
  // convention (no speed bonuses default to 1).
  const bombsBonus = Math.max(0, (stats.maxBombs ?? 1) - 1);
  const fireBonus = Math.max(0, (stats.range ?? 1) - 1);
  const speedBonus = Math.max(0, Math.floor((stats.speed ?? 1) - 1));
  for (let i = 0; i < Math.floor(bombsBonus / 2); i += 1) drops.push("bomb-up");
  for (let i = 0; i < Math.floor(fireBonus / 2); i += 1) drops.push("fire-up");
  for (let i = 0; i < Math.floor(speedBonus / 2); i += 1) drops.push("speed-up");

  // Boolean flags: independent ratio-rolled. remoteDetonateCharges is
  // numeric on the schema but represents a stockpile of one boolean
  // power; treat it as 'flag present' if > 0.
  const flagCandidates: ReadonlyArray<{ flag: boolean; kind: PickupKind }> = [
    { flag: stats.shield === true, kind: "shield" },
    { flag: stats.pierce === true, kind: "pierce" },
    { flag: (stats.remoteDetonateCharges ?? 0) > 0, kind: "remote-detonate" },
    { flag: stats.canKick === true, kind: "kick" },
    { flag: stats.canThrow === true, kind: "throw-glove" },
    { flag: stats.bombPass === true, kind: "bomb-pass" }
  ];
  for (const { flag, kind } of flagCandidates) {
    if (!flag) continue;
    if (rng.next() < options.booleanRatio) drops.push(kind);
  }

  // Cap to the per-death max. Stable sort by DROP_PRIORITY index so
  // we keep numerics + the rarest booleans rather than truncating
  // randomly from the tail.
  if (drops.length <= options.cap) return drops;
  const ranked = [...drops].sort(
    (a, b) => DROP_PRIORITY.indexOf(a) - DROP_PRIORITY.indexOf(b)
  );
  return ranked.slice(0, options.cap);
}

export function createKaboomDeathPickupDropSystem(
  options: KaboomDeathPickupDropOptions = {}
): System {
  const name = options.name ?? "kaboom.death-pickup-drop";
  const disabled = options.disabled === true;
  const booleanRatio = Math.min(1, Math.max(0, options.booleanRatio ?? LOOT_DROP_BOOLEAN_RATIO_DEFAULT));
  const cap = Math.max(0, Math.floor(options.capPerDeath ?? LOOT_DROP_CAP_DEFAULT));
  const lifetimeS = Math.max(0.1, options.lifetimeS ?? LOOT_DROP_LIFETIME_S_DEFAULT);
  const projectSeed = options.seed ?? LOOT_DROP_SEED_DEFAULT;

  const prevAlive = new Map<EntityId, boolean>();
  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS]);
      cachedWorld = world;
      prevAlive.clear();
    }
    const current = new Map<EntityId, boolean>();
    for (const id of bombers!.run()) {
      const stats = world.getComponent<BomberStatsComponent>(id, BOMBER_STATS);
      current.set(id, stats?.alive !== false);
    }
    if (!disabled) {
      for (const [id, nowAlive] of current) {
        const wasAlive = prevAlive.get(id) ?? true;
        if (wasAlive && !nowAlive) handleDeath(world, id);
      }
    }
    for (const id of prevAlive.keys()) {
      if (!current.has(id)) prevAlive.delete(id);
    }
    for (const [id, alive] of current) prevAlive.set(id, alive);
  };

  function handleDeath(world: World, bomberId: EntityId): void {
    const stats = world.getComponent<BomberStatsComponent>(bomberId, BOMBER_STATS);
    if (stats === undefined) return;
    const pos = world.getComponent<GridPositionComponent>(bomberId, GRID_POSITION);
    if (pos?.gx === undefined || pos.gz === undefined) return;
    const roundNumber = world.hasEntity(ROUND_STATE_ID)
      ? world.getComponent<RoundStateComponent>(ROUND_STATE_ID, ROUND_STATE)?.roundNumber ?? 1
      : 1;
    const rng = createSeededRng(dropSeed(bomberId, roundNumber, projectSeed));
    const drops = computeDropList(stats, rng, { booleanRatio, cap });
    for (const kind of drops) {
      const pickupId = spawnKaboomPickup(world, pos.gx, pos.gz, kind);
      // Tag the entity so a separate decay system can find drops
      // without scanning every pickup id.
      world.setComponent(pickupId, LOOT_DROP_DECAY, {
        remainingS: lifetimeS
      });
    }
  }

  return { name, fixedUpdate };
}

/** Separate decay system — runs on every pickup that carries
 *  `LootDropDecay` and removes the entity when the timer reaches 0.
 *  Kept apart from the spawn loop so cap/lifetime overrides stay
 *  cleanly testable. */
export function createKaboomLootDropDecaySystem(options: { name?: string } = {}): System {
  const name = options.name ?? "kaboom.loot-drop-decay";
  let cachedWorld: World | undefined;
  let drops: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      drops = world.createQuery([LOOT_DROP_DECAY, PICKUP]);
      cachedWorld = world;
    }
    const dt = Math.max(0, context.time.fixedDt);
    const toRemove: EntityId[] = [];
    for (const id of drops!.run()) {
      const decay = world.getComponent<{ remainingS?: number }>(id, LOOT_DROP_DECAY);
      if (decay === undefined) continue;
      const next = (decay.remainingS ?? 0) - dt;
      if (next <= 0) {
        toRemove.push(id);
        continue;
      }
      world.setComponent(id, LOOT_DROP_DECAY, { remainingS: next });
    }
    for (const id of toRemove) world.removeEntity(id);
  };

  return { name, fixedUpdate };
}
