// S161 KABOOM-HUD-TOOLTIPS (GDP-2026-05-28-007).
//
// Single source of truth for HUD-tooltip text. The HUD reads this
// registry to build hover tooltips on the local-player power-up grid
// (S148) AND on the opponent active-state badges (S150). Description
// strings live here so future i18n hooks have one seam to wrap.

import type { PowerupIconKind } from "../powerup-icons";

/** Slot-state — drives the per-icon "ACTIVE / LOCKED / N / M" line. */
export type PowerUpSlotState =
  | { kind: "counter"; current: number; max: number }
  | { kind: "level"; level: number; baseline: string }
  | { kind: "flag"; active: boolean }
  | { kind: "cooldown"; readyLabel: string; cooldownMs: number };

/** Tooltip payload — the renderer pairs name + description + state. */
export type TooltipText = {
  name: string;
  description: string;
  /** Optional state subtitle (e.g. "3 / 6", "ACTIVE", "LOCKED — collect the X pickup"). */
  state?: string;
};

const NAME_BY_KIND: Record<PowerupIconKind, string> = {
  "bomb": "Bomb Up",
  "fire": "Fire Up",
  "speed": "Speed Up",
  "kick": "Kick",
  "remote": "Remote",
  "shield": "Shield",
  "pierce": "Pierce",
  "throw-glove": "Throw Glove",
  "bomb-pass": "Bomb Pass",
  "dash": "Dash"
};

const DESCRIPTION_BY_KIND: Record<PowerupIconKind, string> = {
  "bomb": "Total bombs you can place at once.",
  "fire": "Blast range in cells.",
  "speed": "Movement cells per second.",
  "kick": "Walk into your bomb to push it forward.",
  "remote": "Detonate your bombs on demand instead of by fuse.",
  "shield": "Next blast hit won't kill you.",
  "pierce": "Bombs blast through the first soft block in a line.",
  "throw-glove": "Pick up a bomb and throw it 3 cells.",
  "bomb-pass": "Walk through your own bombs.",
  "dash": "Hold Shift + direction to burst 2 cells."
};

const LOCKED_HINT_BY_KIND: Partial<Record<PowerupIconKind, string>> = {
  "kick": "LOCKED — collect a Kick pickup.",
  "remote": "LOCKED — collect a Remote pickup.",
  "shield": "LOCKED — collect a Shield pickup.",
  "pierce": "LOCKED — collect a Pierce pickup.",
  "throw-glove": "LOCKED — collect a Throw Glove pickup.",
  "bomb-pass": "LOCKED — collect a Bomb Pass pickup."
};

/**
 * Build the tooltip payload for a local-player HUD icon given its
 * current slot state. Counter / level / flag / cooldown kinds drive
 * different state-line shapes.
 */
export function tooltipFor(kind: PowerupIconKind, slot?: PowerUpSlotState): TooltipText {
  const name = NAME_BY_KIND[kind];
  const description = DESCRIPTION_BY_KIND[kind];
  let state: string | undefined;
  if (slot === undefined) {
    state = undefined;
  } else if (slot.kind === "counter") {
    state = `${slot.current} / ${slot.max}`;
  } else if (slot.kind === "level") {
    state = slot.level === 0 ? slot.baseline : `+${slot.level}`;
  } else if (slot.kind === "flag") {
    state = slot.active ? "ACTIVE" : (LOCKED_HINT_BY_KIND[kind] ?? "LOCKED");
  } else if (slot.kind === "cooldown") {
    state = slot.cooldownMs <= 0
      ? slot.readyLabel
      : `COOLDOWN ${(slot.cooldownMs / 1000).toFixed(1)}s`;
  }
  return state === undefined ? { name, description } : { name, description, state };
}

/** Build the tooltip payload for an opponent active-state badge. */
export function tooltipForOpponentBadge(kind: PowerupIconKind, opponentLabel: string): TooltipText {
  const description = OPPONENT_BADGE_LINE[kind] ?? `${NAME_BY_KIND[kind]} active.`;
  return {
    name: opponentLabel,
    description,
    state: `${NAME_BY_KIND[kind]} active`
  };
}

const OPPONENT_BADGE_LINE: Partial<Record<PowerupIconKind, string>> = {
  "shield": "Shield active — next blast won't kill them.",
  "pierce": "Pierce active — their bombs blast through soft blocks.",
  "remote": "Remote active — they have armed bombs they can detonate.",
  "throw-glove": "Throw active — they can throw their bombs."
};

/** Render a TooltipText to a `name — description` + optional state line. Used by the DOM renderer. */
export function tooltipToPlainText(t: TooltipText): string {
  const head = `${t.name} — ${t.description}`;
  if (t.state === undefined) return head;
  return `${head}\n${t.state}`;
}

export const __TOOLTIP_REGISTRY = {
  NAME_BY_KIND,
  DESCRIPTION_BY_KIND,
  LOCKED_HINT_BY_KIND,
  OPPONENT_BADGE_LINE
};
