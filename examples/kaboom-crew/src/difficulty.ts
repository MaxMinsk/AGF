// S84 KABOOM-BOT-DIFFICULTY.
//
// Pure helpers for the difficulty dial. The bootstrap reads
// `?difficulty=easy|normal|hard` off the URL on first attach + when
// `restartScene` runs, then applies the preset to bot.1 through
// component.set commands.

export type DifficultyPreset = "easy" | "normal" | "hard";

export type DifficultyTuning = {
  /** BotBrain.aggression — higher values bias to bomb-drop over flee. */
  aggression: number;
  /** Seconds between bot decisions — lower is harder (faster reactions). */
  decisionIntervalMs: number;
  /** BomberStats.range — explosion radius in cells. */
  range: number;
  /** GridMover.speed — cells per second. */
  speed: number;
};

const PRESETS: Record<DifficultyPreset, DifficultyTuning> = {
  easy: { aggression: 0.25, decisionIntervalMs: 500, range: 2, speed: 2 },
  normal: { aggression: 0.5, decisionIntervalMs: 200, range: 2, speed: 3 },
  hard: { aggression: 0.85, decisionIntervalMs: 120, range: 3, speed: 4 }
};

export function isDifficultyPreset(value: string): value is DifficultyPreset {
  return value === "easy" || value === "normal" || value === "hard";
}

export function getDifficultyTuning(preset: DifficultyPreset): DifficultyTuning {
  return PRESETS[preset];
}

/** Read `?difficulty=…` off `location.search`. Returns 'normal' on unknown values. */
export function readDifficultyFromUrl(search: string | undefined): DifficultyPreset {
  if (search === undefined || search.length === 0) return "normal";
  try {
    const params = new URLSearchParams(search);
    const raw = params.get("difficulty");
    if (raw !== null && isDifficultyPreset(raw)) return raw;
  } catch {
    // ignored — fall through
  }
  return "normal";
}

/**
 * Produce the component patch the bootstrap should apply to bot.1 to
 * realise the preset. BotBrain.nextDecisionIn translates from
 * decisionIntervalMs (the public dial unit) into seconds (the
 * BotAISystem unit) so the existing system code doesn't have to
 * branch on milliseconds.
 */
// S100 KABOOM-BOT-PERSONALITY-VARIANTS. Same parse pattern as
// difficulty: `?botPersonality=hunter|coward|miner`. Default
// 'hunter' (current behaviour). Pure helper — applied by the
// bootstrap on bot spawn alongside difficultyComponentPatch.
export type BotPersonality = "hunter" | "coward" | "miner";

export function isBotPersonality(v: string): v is BotPersonality {
  return v === "hunter" || v === "coward" || v === "miner";
}

export function readBotPersonalityFromUrl(search: string | undefined): BotPersonality {
  if (search === undefined || search.length === 0) return "hunter";
  try {
    const params = new URLSearchParams(search);
    const raw = params.get("botPersonality");
    if (raw !== null && isBotPersonality(raw)) return raw;
  } catch {
    // ignored — fall through
  }
  return "hunter";
}

export function difficultyComponentPatch(preset: DifficultyPreset): {
  BotBrain: { aggression: number; nextDecisionIn: number };
  BomberStats: { maxBombs: number; range: number; activeBombs: number; alive: true };
  GridMover: { speed: number };
} {
  const tuning = getDifficultyTuning(preset);
  return {
    BotBrain: {
      aggression: tuning.aggression,
      nextDecisionIn: tuning.decisionIntervalMs / 1000
    },
    BomberStats: { maxBombs: 1, range: tuning.range, activeBombs: 0, alive: true },
    GridMover: { speed: tuning.speed }
  };
}
