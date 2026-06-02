// S258 — palette resolution helper for kaboom-crew bombers. Maps a
// bomber entity id to the hex colour we use to tint puff cues that
// originate from that bomber. Centralises the same mapping that
// S257 introduced inline in bomb-placement-system, so the other
// owner-aware puffs (death-bomb, throw-land, pickup-lift) can share
// one source of truth.
//
// Returns undefined for bomber ids the system doesn't recognise so
// callers can cleanly fall back to the preset's default colour.

import type { EntityId } from "../../../../engine/core/ecs/types";
import type { World } from "../../../../engine/core/ecs/world";

/** Body-colour hex for each bomber. Sourced from
 *  `examples/procbomber-bench/src/generators/bomber-palette.ts` —
 *  the palette `torsoTop` channel reads strongest from the
 *  top-down camera. */
const PERSONALITY_PUFF_COLOR: Record<"hunter" | "coward" | "miner", string> = {
  hunter: "#e65a3a", // ember.torsoTop
  coward: "#5a6a82", // slate.torsoTop
  miner: "#c9a14d"  // sand.torsoTop
};

const PLAYER_PUFF_COLOR = "#3ab0ff"; // sky.torsoTop

/** Hex colour for the puff that this bomber emits, or undefined when
 *  the bomber id isn't a known kaboom-crew bomber. */
export function bomberPuffColor(world: World, bomberId: EntityId): string | undefined {
  if (bomberId === "player.1") return PLAYER_PUFF_COLOR;
  const brain = world.getComponent<{ personality?: "hunter" | "coward" | "miner" }>(bomberId, "BotBrain");
  const persona = brain?.personality;
  if (persona === undefined) return undefined;
  return PERSONALITY_PUFF_COLOR[persona];
}
