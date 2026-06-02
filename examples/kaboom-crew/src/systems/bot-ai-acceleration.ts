// S250 — first slice of the bot-ai-helpers per-concern split (the
// helpers file grew to 689 LOC across S234-S241). This module owns
// the S210 KABOOM-BOT-ACCELERATION concern: the constants, the boost
// formula, and the alive-bomber counter that drives HUMANS_DEAD mode
// entry/exit.
//
// Both functions are pure reads (no closure state, no QueryHandle
// caching). `bot-ai-helpers.ts` re-exports everything so existing
// imports keep working unchanged.

import type { World } from "../../../../engine/core/ecs/world";

/** S210 KABOOM-BOT-ACCELERATION default base boost. */
export const BOT_ACCELERATION_BASE_BOOST_DEFAULT = 0.25;
/** S210 — boost added per 15 s elapsed since humans-all-dead. */
export const BOT_ACCELERATION_ESCALATION_STEP = 0.10;
/** S210 — max escalation bonus on top of the base boost. */
export const BOT_ACCELERATION_ESCALATION_CAP = 0.30;
/** S210 — escalation interval in seconds. */
export const BOT_ACCELERATION_ESCALATION_INTERVAL_S = 15;

/** S210 — given the timestamp humans first all died (or undefined
 *  when still alive), return the current aggression boost to add to
 *  `brain.aggression * personalityScale`. */
export function botAccelerationBoost(
  humansAllDeadAt: number | undefined,
  nowS: number,
  baseBoost: number = BOT_ACCELERATION_BASE_BOOST_DEFAULT
): number {
  if (humansAllDeadAt === undefined) return 0;
  const elapsed = Math.max(0, nowS - humansAllDeadAt);
  const steps = Math.floor(elapsed / BOT_ACCELERATION_ESCALATION_INTERVAL_S);
  const escalation = Math.min(BOT_ACCELERATION_ESCALATION_CAP, steps * BOT_ACCELERATION_ESCALATION_STEP);
  return baseBoost + escalation;
}

/** S210 — count alive PlayerControlled bombers + alive bots in one
 *  pass. Used by the bot-ai system to enter / exit HUMANS_DEAD mode. */
export function countAliveBombers(world: World): { humans: number; bots: number } {
  let humans = 0;
  let bots = 0;
  for (const id of world.entityIds()) {
    if (!world.hasComponent(id, "BomberStats")) continue;
    const stats = world.getComponent<{ alive?: boolean }>(id, "BomberStats");
    if (stats?.alive === false) continue;
    if (world.hasComponent(id, "PlayerControlled")) humans += 1;
    else if (world.hasComponent(id, "BotBrain")) bots += 1;
  }
  return { humans, bots };
}
