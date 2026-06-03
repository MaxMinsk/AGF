// S250-S254 — pure re-export barrel for the per-concern bot-ai
// helpers. Behaviour split across 5 concern files:
//
//   - bot-ai-acceleration: S210 HUMANS_DEAD boost mechanic + counters
//   - bot-ai-perception:   shared types/constants + danger map +
//                          cardinal neighbours + player anticipation
//   - bot-ai-goals:        nearest-* spatial finders + personality
//                          goal dispatcher
//   - bot-ai-tactical:     per-action tactical detectors (remote,
//                          shield, pierce, soft-blocks-in-line,
//                          throw, kick, tally bias)
//   - bot-ai-decision:     top-level orchestrators
//                          (pickBotDirection + decideBotShouldDropBomb)
//
// `bot-ai-system.ts` and the bot-ai-helpers unit test continue to
// import from this file; the per-concern modules are the new "deep"
// import target for future call-sites that want a tighter dependency.

export {
  BOT_ACCELERATION_BASE_BOOST_DEFAULT,
  BOT_ACCELERATION_ESCALATION_STEP,
  BOT_ACCELERATION_ESCALATION_CAP,
  BOT_ACCELERATION_ESCALATION_INTERVAL_S,
  botAccelerationBoost,
  countAliveBombers
} from "./bot-ai-acceleration";

export {
  BOMBER_STATS,
  BOMB,
  DIRECTIONS_4,
  GRID_POSITION,
  botPassableNeighbours,
  buildBotDangerMap,
  playerInDashLine,
  predictNextCell
} from "./bot-ai-perception";
export type {
  BotOccupancyQuery,
  BotPersonality,
  BotQueryHandleLike
} from "./bot-ai-perception";

export {
  nearestBotPickup,
  nearestBotSoftBlock,
  nearestBotOtherBomber,
  nearestBotPlayer,
  selectBotPersonalityGoal
} from "./bot-ai-goals";

export {
  shouldRemoteDetonate,
  personalityTallyBias,
  tallyBiasForDiff,
  shiftedPersonalityLabel,
  countSoftBlocksInLine,
  wouldKillEnemyAt,
  maybeFireBotThrow,
  findBotKickOpportunity
} from "./bot-ai-tactical";

export {
  pickBotDirection,
  decideBotShouldDropBomb
} from "./bot-ai-decision";
