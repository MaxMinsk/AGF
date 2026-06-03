import { expandScenePrefabs, type PrefabDefinition } from "../../engine/core/scene/expand-prefabs";
import { createGridOccupancySystem } from "../../engine/core/systems/grid-occupancy-system";
import { createGridMovementSystem } from "../../engine/core/systems/grid-movement-system";
import { createKaboomBomberHeightLiftSystem } from "./src/systems/bomber-height-lift-system";
import { createKaboomStepJumpFxSystem } from "./src/systems/step-jump-fx-system";
import { createKaboomPickupHoverSpinSystem } from "./src/systems/pickup-hover-spin-system";
import { createKaboomPickupMagnetSystem } from "./src/systems/pickup-magnet-system";
import { fadeOutOpacityCurve } from "./src/title-fade";
import type { SceneInput } from "../../engine/core/ecs/types";
import type { EngineCommand } from "../../engine/core/commands/types";
import {
  registerRagdollTemplate
} from "../../engine/physics/ragdoll/template-registry";
import {
  KABOOM_BOMBER_RAGDOLL,
  KABOOM_BOMBER_RAGDOLL_KEY
} from "./src/characters/kaboom-bomber-ragdoll-template";
import type {
  ProjectBootstrap,
  ProjectBootstrapContext,
  ProjectConnectivityHintInput,
  ProjectUiContext,
  ProjectUiHandle
} from "../../engine/runtime/project-bootstrap";
import type { RuntimeHandle } from "../../engine/runtime/start";
import { createMinimapWidget } from "../../engine/runtime/ui/minimap";
import startSceneJson from "./scenes/start.scene.json";
import wideSceneJson from "./scenes/wide.scene.json";
import corridorSceneJson from "./scenes/corridor.scene.json";
import corridorsSceneJson from "./scenes/corridors.scene.json";
import clusterRoomsSceneJson from "./scenes/cluster-rooms.scene.json";
import plazaSceneJson from "./scenes/plaza.scene.json";
import crossSceneJson from "./scenes/cross.scene.json";
import pitSceneJson from "./scenes/pit.scene.json";
import beltZoneSceneJson from "./scenes/belt-zone.scene.json";
import warpfieldSceneJson from "./scenes/warpfield.scene.json";
import platePuzzleSceneJson from "./scenes/plate-puzzle.scene.json";
import heightmapDemoSceneJson from "./scenes/heightmap-demo.scene.json";
import grassDemoSceneJson from "./scenes/grass-demo.scene.json";
// Static prefab imports. Vite picks them up at build time so the
// restart path doesn't have to round-trip through `import.meta.glob`.
import playerPrefab from "./prefabs/player.prefab.json";
import botPrefab from "./prefabs/bot.prefab.json";
import softBlockPrefab from "./prefabs/soft-block.prefab.json";
import hardBlockPrefab from "./prefabs/hard-block.prefab.json";
import bombPrefab from "./prefabs/bomb.prefab.json";
// S104 KABOOM-MIGRATE-PREFABS — procedural bomber tree replaces the
// old static sphere meshes. Generator lives in procbomber-bench;
// integration glue is project-local.
import {
  registerProcbomberBuilders,
  spawnBomberFor
} from "./src/procbomber-integration";
import { createBenchAnimationSystem } from "../procbomber-bench/src/systems/bench-animation-system";
import { createSpringPivotSystem } from "../procbomber-bench/src/systems/spring-pivot-system";
import { createSoftAttachSwaySystem } from "../procbomber-bench/src/systems/soft-attach-sway-system";
import { createKaboomBomberAnimationDriverSystem } from "./src/systems/bomber-animation-driver";
import { createKaboomBomberFaceMovementSystem } from "./src/systems/bomber-face-movement-system";
import { createKaboomBomberOutlineSystem } from "./src/systems/bomber-outline-system";
import { createKaboomBombOutlineSystem } from "./src/systems/bomb-outline-system";

// S104 KABOOM-MIGRATE-PREFABS + S139 KABOOM-BOT-PERSONALITY-VISUALS.
// The pure recipe derivation lives in ./src/kaboom-recipe so it can
// be unit-tested without bootstrapping a runtime. S141 — multi-bot
// solo assignment lives there too.
import { makeKaboomRecipe, MULTI_BOT_ASSIGNMENT, MULTI_BOT_IDS } from "./src/kaboom-recipe";
import { voiceParamsFromRecipe } from "./src/voice-synth";
import { createKaboomPlayerInputSystem } from "./src/systems/player-input-system";
import { createKaboomBombPlacementSystem } from "./src/systems/bomb-placement-system";
import { createKaboomPlaceBombNetworkRelaySystem } from "./src/systems/place-bomb-network-relay-system";
import { createKaboomConnectedBlastDecoderSystem } from "./src/systems/connected-blast-decoder-system";
import { createKaboomBombKickSystem } from "./src/systems/bomb-kick-system";
import { createKaboomBombFuseSystem } from "./src/systems/bomb-fuse-system";
import { createKaboomBombFuseColorSystem } from "./src/systems/bomb-fuse-color-system";
import { createKaboomBombPickupSystem } from "./src/systems/bomb-pickup-system";
import { createKaboomBombThrowSystem } from "./src/systems/bomb-throw-system";
import { createKaboomDashSystem } from "./src/systems/dash-system";
import { createKaboomDashTrailSystem } from "./src/systems/dash-trail-system";
import { createKaboomConveyorBeltSystem } from "./src/systems/conveyor-belt-system";
import { createKaboomWarpHoleSystem } from "./src/systems/warp-hole-system";
import { createKaboomPressurePlateSystem } from "./src/systems/pressure-plate-system";
import { createKaboomBlastPropagationSystem } from "./src/systems/blast-propagation-system";
import { createKaboomSoftBlockDebrisSystem } from "./src/systems/soft-block-debris-system";
import { createKaboomHitRecoilSystem } from "./src/systems/hit-recoil-system";
import { createKaboomBlastTileLifetimeSystem } from "./src/systems/blast-tile-lifetime-system";
import { createKaboomScorchTileLifetimeSystem } from "./src/systems/scorch-tile-system";
import { createKaboomRoundResolveSystem } from "./src/systems/round-resolve-system";
import { createKaboomSoftBlockShuffleSystem } from "./src/systems/soft-block-shuffle-system";
import { createKaboomRoundCelebrationFxSystem } from "./src/systems/round-celebration-fx-system";
import { createKaboomSuddenDeathSystem } from "./src/systems/sudden-death-system";
import { createKaboomAccessoryDetachSystem } from "./src/systems/accessory-detach-system";
import {
  createKaboomBotAISystem,
  BOT_ACCELERATION_BASE_BOOST_DEFAULT,
  shiftedPersonalityLabel
} from "./src/systems/bot-ai-system";
import { createKaboomBombBlockSystem } from "./src/systems/bomb-block-system";
import { createKaboomAgentGotoSystem } from "./src/systems/agent-goto-system";
import { createKaboomRemoteBomberDecoratorSystem } from "./src/systems/remote-bomber-decorator-system";
import { createKaboomRemoteBomberInterpolatorSystem } from "./src/systems/remote-bomber-interpolator-system";
import { createKaboomPickupSpawnSystem } from "./src/systems/pickup-spawn-system";
import { createKaboomPickupCollectSystem } from "./src/systems/pickup-collect-system";
import { createKaboomAudioBindingSystem, type AudioEventKind } from "./src/systems/audio-binding-system";
import {
  createKaboomCameraControlSystem,
  ADAPTIVE_FOLLOW_MIN_PARALLAX_DEFAULT,
  SPAWN_FLICKER_DURATION_S_DEFAULT,
  SPAWN_FLICKER_Y_OFFSET_DEFAULT,
  type FollowMode
} from "./src/systems/camera-control-system";
import { createKaboomCameraZoomSystem } from "./src/systems/camera-zoom-system";
import { createKaboomDeathTriggerSystem } from "./src/systems/death-trigger-system";
import {
  createKaboomDeathPickupDropSystem,
  createKaboomLootDropDecaySystem,
  LOOT_DROP_BOOLEAN_RATIO_DEFAULT,
  LOOT_DROP_CAP_DEFAULT,
  LOOT_DROP_LIFETIME_S_DEFAULT
} from "./src/systems/death-pickup-drop-system";
import {
  createKaboomRevengeSystem,
  REVENGE_ARC_DURATION_S_DEFAULT,
  REVENGE_BUDGET_DEFAULT,
  REVENGE_COOLDOWN_S_DEFAULT
} from "./src/systems/revenge-system";
import {
  createKaboomDeathBombDropSystem,
  DEATH_BOMB_RANGE_DEFAULT
} from "./src/systems/death-bomb-drop-system";
// S165 KABOOM-MULTI-VARIANT-BLOCKS — per-cell procedural variant
// builders for hard / soft blocks + floor tiles; block-variant-system
// rewrites MeshRenderer.mesh refs of cells at scene-load so the
// renderer resolves through these procedural builders instead of the
// engine box primitive.
import { registerKaboomBlockBuilders } from "./src/register-block-builders";
import { registerKaboomBombOutlineBuilder } from "./src/register-bomb-outline-builder";
import {
  createKaboomBlockVariantSystem,
  createKaboomWangMeshSyncSystem
} from "./src/systems/block-variant-system";
// S171 KABOOM-ARENA-THEMES MVP (GDP-2026-05-28-013) — re-tint the floor
// MeshRenderer.color at scene-load from a registered theme. Lighting +
// block-palette re-tinting deferred (see theme-table.ts header).
import {
  createArenaThemeApplySystem,
  startArenaSkyApplyPoller,
  startArenaLightApplyPoller,
  startArenaAtmosphericApplyPoller
} from "./src/systems/arena-theme-apply-system";
import {
  ARENA_THEMES,
  defaultThemeForArena,
  isArenaThemeKey,
  type ArenaThemeKey
} from "./src/themes/theme-table";
// S170 KABOOM-WANG-INTEGRATION (GDP-2026-05-28-004 Stage 3) — engine
// Wang autotile resolver + Kaboom-side family registration.
import { createWangTileResolverSystem } from "../../engine/render/autotile";
import { registerKaboomWangFamilies } from "./src/blocks/register-wang-families";
import { projectedBlastCells } from "./src/danger";
import { createKaboomAudioFx, resolveAudioMuted, resolveAudioVolume, AUDIO_MUTED_STORAGE_KEY } from "./src/audio-fx";
import { forwardAudioEvent } from "./src/audio-event-forward";
// S148 KABOOM-POWERUP-HUD — icon grid + pickup tooltip widgets read
// the same per-frame snapshot the stats line uses.
import {
  PICKUP_ICON,
  PICKUP_TOOLTIP_LABEL,
  powerupIconSvgInner,
  type PowerupIconKind
} from "./src/powerup-icons";
// S153 KABOOM-PLAYER-PROFILE — localStorage-backed persistent profile.
import { createProfileStore, type ProfileStore } from "./src/profile/profile-store";
// S217 KABOOM-VIGNETTE-OVERLAY — pure-DOM vignette (the engine
// post-FX vignette is WebGL-only; Kaboom Crew runs on WebGPU).
// S218 — tint the gradient with the active arena theme's
// ambientHemisphericGround so the vignette pulls into the theme
// colour family rather than crushing the corners flat black.
import {
  applyVignetteTint,
  mountVignetteOverlay,
  readVignetteOptionsFromUrl,
  type KaboomVignetteOptions
} from "./src/ui/vignette-overlay";
// S156 KABOOM-COSMETIC-UNLOCKS — 5 starter unlocks + banner on threshold cross.
import {
  checkUnlocks,
  findUnlock,
  UNLOCK_DEFS,
  unlockedAccessoryKinds,
  type UnlockId
} from "./src/profile/unlock-checker";
// S150 KABOOM-OPPONENT-BADGES — Layer 3 of GDP-2026-05-27-005 (HUD
// approximation; world-space billboards deferred to a follow-up).
import {
  badgesForOpponent,
  isOpponent,
  opponentAccentColor
} from "./src/opponent-badges";
import { difficultyComponentPatch, readDifficultyFromUrl, resolveSessionBotPersonality, type BotPersonality } from "./src/difficulty";
import { applyHeightmapCommands, applyTerrainmapCommands, upsertEntityCommands } from "./src/bootstrap-helpers";
import { resolveSessionMap } from "./src/map-pick";
import {
  tooltipFor as tooltipForPowerUp,
  tooltipForOpponentBadge,
  type PowerUpSlotState
} from "./src/hud/power-up-descriptions";
import { installIconTooltipOverlay, TOOLTIP_ATTRS, type IconTooltipOverlayHandle } from "./src/hud/icon-tooltip-overlay";

const DEFAULT_ROUND_TIME_LIMIT_SECONDS = 90;
/**
 * S115 KABOOM-MATCH-STRUCTURE — `?matchTarget=N` overrides the
 * default best-of-3. 1 = single-round match, 5 = best-of-5, etc.
 * Returns undefined when the param is absent or unparseable so callers
 * fall back to the schema default (3).
 */
function readMatchTargetFromUrl(): number | undefined {
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return undefined;
  try {
    const v = new URLSearchParams(search).get("matchTarget");
    if (v === null) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1 || n > 99) return undefined;
    return Math.round(n);
  } catch {
    return undefined;
  }
}

function readRoundTimeLimit(): number {
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return DEFAULT_ROUND_TIME_LIMIT_SECONDS;
  try {
    const value = new URLSearchParams(search).get("roundTimeLimit");
    if (value === null) return DEFAULT_ROUND_TIME_LIMIT_SECONDS;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_ROUND_TIME_LIMIT_SECONDS;
    return parsed;
  } catch {
    return DEFAULT_ROUND_TIME_LIMIT_SECONDS;
  }
}

// S163 — read camera-follow URL flags.
function readCameraConfigFromUrl(): {
  mode: "follow" | "centre" | "spectate";
  viewSize: number;
  spectateTargetId?: string;
} {
  const defaults = { mode: "follow" as const, viewSize: 11 / (2 * (16 / 9)) };
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return defaults;
  try {
    const p = new URLSearchParams(search);
    const cam = p.get("camera") ?? "follow";
    let mode: "follow" | "centre" | "spectate";
    let spectateTargetId: string | undefined;
    if (cam === "centre") mode = "centre";
    else if (cam.startsWith("spectate-")) {
      mode = "spectate";
      spectateTargetId = cam.slice("spectate-".length);
    } else mode = "follow";
    const viewSizeRaw = p.get("viewSize");
    const viewSizeParsed = viewSizeRaw === null ? Number.NaN : Number(viewSizeRaw);
    const tileWide = Number.isFinite(viewSizeParsed) && viewSizeParsed >= 8 && viewSizeParsed <= 20
      ? viewSizeParsed
      : 11;
    const orthoSize = tileWide / (2 * (16 / 9));
    return spectateTargetId !== undefined
      ? { mode, viewSize: orthoSize, spectateTargetId }
      : { mode, viewSize: orthoSize };
  } catch {
    return defaults;
  }
}

// S171 KABOOM-ARENA-THEMES MVP — read `?theme=warehouse|factory|dock|lab|bunker`.
// Returns undefined when the param is absent or unparseable so callers
// fall back to defaultThemeForArena() / "warehouse".
// S195 — `?follow=off|snap` overrides the default damped follow mode.
function readFollowModeFromUrl(): FollowMode {
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return "damped";
  try {
    const v = new URLSearchParams(search).get("follow");
    if (v === "off") return "off";
    if (v === "snap") return "snap";
    return "damped";
  } catch {
    return "damped";
  }
}

// S277 — outline-occluder URL gate. `?occluderOutline=off` disables the
// see-through bomber silhouette feature; default ON now that the engine
// drives a proper depth pre-pass (no self-occlusion, single extra render
// at half resolution).
function resolveOccluderOutlineEnabled(): boolean {
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return true;
  try {
    const v = new URLSearchParams(search).get("occluderOutline");
    if (v === "off" || v === "false" || v === "0") return false;
    return true;
  } catch {
    return true;
  }
}

function readArenaThemeFromUrl(): ArenaThemeKey | undefined {
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return undefined;
  try {
    const v = new URLSearchParams(search).get("theme");
    if (v === null) return undefined;
    return isArenaThemeKey(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

// S211 KABOOM-REVENGE — read revenge URL flags:
//   ?revenge=off              disables the feature
//   ?revengeCount=N           per-round bomb budget per dead bomber
//   ?revengeCooldownS=N       seconds between successive launches
//   ?revengeBotAi=on          enable bot auto-fire (off by default;
//                             waits for the V2 arc/telegraph polish)

// S226 KABOOM-DEATH-BOMB-DROP — URL flags:
//   ?deathBomb=off            disables the auto-bomb on death
//   ?deathBombRange=N         override default range (1..4)
function readDeathBombParamsFromUrl(): { disabled: boolean; range: number } {
  const defaults = { disabled: false, range: DEATH_BOMB_RANGE_DEFAULT };
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return defaults;
  try {
    const p = new URLSearchParams(search);
    const disabled = p.get("deathBomb") === "off";
    const raw = p.get("deathBombRange");
    const parsed = raw === null ? defaults.range : Number(raw);
    const range = Number.isFinite(parsed) && parsed >= 1 && parsed <= 4 ? Math.floor(parsed) : defaults.range;
    return { disabled, range };
  } catch {
    return defaults;
  }
}

function readRevengeParamsFromUrl(): {
  disabled: boolean;
  bombsBudget: number;
  cooldownS: number;
  /** Tri-state: undefined = use system default, true = force on,
   *  false = force off. S219 flips the default to ON, so the URL
   *  flag is now an opt-OUT (`?revengeBotAi=off`). */
  botAutoFire: boolean | undefined;
  arcDurationS: number;
} {
  // S226 — revenge-cart is now superseded by death-bomb-drop
  // (GDP-2026-06-02-001). Default flips to DISABLED so two
  // overlapping parting-shot mechanics don't bombard the survivor.
  // Opt-IN via `?revenge=on` keeps the click-to-throw mechanic
  // available for testing.
  const defaults = {
    disabled: true,
    bombsBudget: REVENGE_BUDGET_DEFAULT,
    cooldownS: REVENGE_COOLDOWN_S_DEFAULT,
    botAutoFire: undefined as boolean | undefined,
    arcDurationS: REVENGE_ARC_DURATION_S_DEFAULT
  };
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return defaults;
  try {
    const params = new URLSearchParams(search);
    const revengeFlag = params.get("revenge");
    const disabled = revengeFlag === "off" ? true : revengeFlag === "on" ? false : defaults.disabled;
    const countRaw = params.get("revengeCount");
    const countParsed = countRaw === null ? defaults.bombsBudget : Number(countRaw);
    const bombsBudget = Number.isFinite(countParsed) && countParsed >= 0 ? Math.floor(countParsed) : defaults.bombsBudget;
    const coolRaw = params.get("revengeCooldownS");
    const coolParsed = coolRaw === null ? defaults.cooldownS : Number(coolRaw);
    const cooldownS = Number.isFinite(coolParsed) && coolParsed >= 0 ? coolParsed : defaults.cooldownS;
    const botRaw = params.get("revengeBotAi");
    const botAutoFire: boolean | undefined =
      botRaw === "on" ? true : botRaw === "off" ? false : undefined;
    const arcRaw = params.get("revengeArcS");
    const arcParsed = arcRaw === null ? defaults.arcDurationS : Number(arcRaw);
    const arcDurationS = Number.isFinite(arcParsed) && arcParsed > 0 ? arcParsed : defaults.arcDurationS;
    return { disabled, bombsBudget, cooldownS, botAutoFire, arcDurationS };
  } catch {
    return defaults;
  }
}

// S210 KABOOM-BOT-ACCELERATION — read bot-only round acceleration
// flags:
//   ?botAccelerate=off          disables the boost entirely
//   ?botAccelerationBoost=N     overrides base 0.25 boost
function readBotAccelerationFromUrl(): { disabled: boolean; baseBoost: number } {
  const defaults = { disabled: false, baseBoost: BOT_ACCELERATION_BASE_BOOST_DEFAULT };
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return defaults;
  try {
    const params = new URLSearchParams(search);
    const disabled = params.get("botAccelerate") === "off";
    const raw = params.get("botAccelerationBoost");
    const parsed = raw === null ? defaults.baseBoost : Number(raw);
    const baseBoost = Number.isFinite(parsed) && parsed >= 0 ? parsed : defaults.baseBoost;
    return { disabled, baseBoost };
  } catch {
    return defaults;
  }
}

// S208 KABOOM-LOOT-DROP — read loot-drop URL flags:
//   ?lootDrop=off              disables drops entirely
//   ?lootDropRatio=N           overrides per-boolean drop probability (0..1)
//   ?lootDropMax=N             overrides per-death cap (default 5)
//   ?lootDropLifetimeS=N       overrides 30 s drop persistence
function readLootDropParamsFromUrl(): {
  disabled: boolean;
  booleanRatio: number;
  cap: number;
  lifetimeS: number;
} {
  const defaults = {
    disabled: false,
    booleanRatio: LOOT_DROP_BOOLEAN_RATIO_DEFAULT,
    cap: LOOT_DROP_CAP_DEFAULT,
    lifetimeS: LOOT_DROP_LIFETIME_S_DEFAULT
  };
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return defaults;
  try {
    const params = new URLSearchParams(search);
    const disabled = params.get("lootDrop") === "off";
    const ratioRaw = params.get("lootDropRatio");
    const ratio = ratioRaw === null ? defaults.booleanRatio : Number(ratioRaw);
    const booleanRatio = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : defaults.booleanRatio;
    const maxRaw = params.get("lootDropMax");
    const maxParsed = maxRaw === null ? defaults.cap : Number(maxRaw);
    const cap = Number.isFinite(maxParsed) && maxParsed >= 0 ? Math.floor(maxParsed) : defaults.cap;
    const lifeRaw = params.get("lootDropLifetimeS");
    const lifeParsed = lifeRaw === null ? defaults.lifetimeS : Number(lifeRaw);
    const lifetimeS = Number.isFinite(lifeParsed) && lifeParsed > 0 ? lifeParsed : defaults.lifetimeS;
    return { disabled, booleanRatio, cap, lifetimeS };
  } catch {
    return defaults;
  }
}

// S160 — read sudden-death URL flags (?suddenDeath=off, ?suddenDeathTriggerS=N).
function readSuddenDeathFromUrl(): { enabled: boolean; triggerAtElapsedS: number } {
  const defaults = { enabled: true, triggerAtElapsedS: 60 };
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return defaults;
  try {
    const params = new URLSearchParams(search);
    const sd = params.get("suddenDeath");
    const enabled = sd === "off" ? false : defaults.enabled;
    const triggerRaw = params.get("suddenDeathTriggerS");
    const triggerParsed = triggerRaw === null ? Number.NaN : Number(triggerRaw);
    const triggerAtElapsedS = Number.isFinite(triggerParsed) && triggerParsed >= 0 ? triggerParsed : defaults.triggerAtElapsedS;
    return { enabled, triggerAtElapsedS };
  } catch {
    return defaults;
  }
}

// S267 KABOOM-STEP-JUMP-AUDIO — read `?stepJumpAudio=off` to disable
// the takeoff whoosh + landing thud. Default on. Useful for tests +
// a calmer audio mix.
function readStepJumpAudioFromUrl(): boolean {
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return true;
  try {
    const p = new URLSearchParams(search);
    return p.get("stepJumpAudio") !== "off";
  } catch {
    return true;
  }
}


// S261 KABOOM-RANDOM-LAYOUT — read `?randomLayout=on`. Default off so
// the curated arena layouts remain canonical; opt-in re-rolls the soft-
// block layout each round under the same hard-block skeleton.
function readRandomLayoutFromUrl(): boolean {
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return false;
  try {
    const p = new URLSearchParams(search);
    return p.get("randomLayout") === "on";
  } catch {
    return false;
  }
}

// S212 KABOOM-CAMERA-ADAPTIVE-FOLLOW — read adaptive-camera URL flags:
//   ?adaptiveCamera=off       reverts to S195 unscaled follow
//   ?minParallax=N            min per-axis follow factor on fits-in-view
//                             arenas (default 0.05 — 5 %)
//   ?viewSize=N               reuses the existing param (tile-wide view)
function readAdaptiveCameraFromUrl(): {
  disabled: boolean;
  minParallax: number;
  viewTilesWide: number;
} {
  const defaults = {
    disabled: false,
    minParallax: ADAPTIVE_FOLLOW_MIN_PARALLAX_DEFAULT,
    viewTilesWide: 11
  };
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return defaults;
  try {
    const p = new URLSearchParams(search);
    const disabled = p.get("adaptiveCamera") === "off";
    const minRaw = p.get("minParallax");
    const minParsed = minRaw === null ? defaults.minParallax : Number(minRaw);
    const minParallax = Number.isFinite(minParsed) ? Math.min(1, Math.max(0, minParsed)) : defaults.minParallax;
    const vsRaw = p.get("viewSize");
    const vsParsed = vsRaw === null ? Number.NaN : Number(vsRaw);
    const viewTilesWide = Number.isFinite(vsParsed) && vsParsed >= 4 && vsParsed <= 30 ? vsParsed : defaults.viewTilesWide;
    return { disabled, minParallax, viewTilesWide };
  } catch {
    return defaults;
  }
}

// S215 KABOOM-CAMERA-SPAWN-FLICKER — read URL flags:
//   ?spawnFlicker=off         disables the dip
//   ?spawnFlickerDurationS=N  override 0.3 s
//   ?spawnFlickerYOffset=N    override 1.5 cells
function readSpawnFlickerFromUrl(): { disabled: boolean; durationS: number; yOffset: number } {
  const defaults = {
    disabled: false,
    durationS: SPAWN_FLICKER_DURATION_S_DEFAULT,
    yOffset: SPAWN_FLICKER_Y_OFFSET_DEFAULT
  };
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return defaults;
  try {
    const p = new URLSearchParams(search);
    const disabled = p.get("spawnFlicker") === "off";
    const durRaw = p.get("spawnFlickerDurationS");
    const durParsed = durRaw === null ? defaults.durationS : Number(durRaw);
    const durationS = Number.isFinite(durParsed) && durParsed > 0 ? durParsed : defaults.durationS;
    const yRaw = p.get("spawnFlickerYOffset");
    const yParsed = yRaw === null ? defaults.yOffset : Number(yRaw);
    const yOffset = Number.isFinite(yParsed) ? yParsed : defaults.yOffset;
    return { disabled, durationS, yOffset };
  } catch {
    return defaults;
  }
}

/**
 * S81 KABOOM-PROJECT-SCAFFOLD + S82 gameplay v0.
 *
 * Registers the grid stack, the project-local player input, the bomb
 * pipeline (place → fuse → blast → damage → tile lifetime), and the
 * round-resolve / restart system.
 *
 * KABOOM-RESTART: `resetRound(runtime)` is the canonical entry point —
 * the input layer writes `RoundRestartRequest` transients when the
 * player hits R, RoundResolveSystem ignores them while the round is
 * still in progress + invokes the on-restart callback when the round
 * has ended. The callback applies a `scene.load` command against the
 * static start scene, which rebuilds the world deterministically.
 */
// Build a static prefab registry once at module load. The engine
// `scene.load` command does NOT re-expand `instances[]`, so we
// expand the start scene against the registry up front and emit a
// flat scene whose `entities[]` already contains every prefab
// instance. Without this, restart leaves the world with only the 5
// scene-level entities (camera + lights + grid config + floor) and
// RoundState.phase stays at "won" / "lost" forever — the visible
// symptom was the player input freezing while the bot kept moving
// in fixedUpdate between the (still-running) RoundResolveSystem's
// queuedDirection-zeroing passes.
const PROJECT_PREFABS: ReadonlyMap<string, PrefabDefinition> = new Map<string, PrefabDefinition>([
  [playerPrefab.id, playerPrefab as PrefabDefinition],
  [botPrefab.id, botPrefab as PrefabDefinition],
  [softBlockPrefab.id, softBlockPrefab as PrefabDefinition],
  [hardBlockPrefab.id, hardBlockPrefab as PrefabDefinition],
  [bombPrefab.id, bombPrefab as PrefabDefinition]
]);

// S86 KABOOM-MAP-VARIANT-WIDE. Map id resolution + scene-source lookup.
// S89 KABOOM-AGENT-MAP-LIST. Single registry shared by URL parsing
// (`readMapName`), the scene builder, and the runtime accessor
// (`runtime.kaboom.maps()` + `loadMap()`).
const MAP_REGISTRY: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  ["start", startSceneJson],
  ["wide", wideSceneJson],
  ["corridor", corridorSceneJson],
  ["corridors", corridorsSceneJson],
  ["cluster-rooms", clusterRoomsSceneJson],
  ["plaza", plazaSceneJson],
  ["cross", crossSceneJson],
  ["pit", pitSceneJson],
  ["belt-zone", beltZoneSceneJson],
  ["warpfield", warpfieldSceneJson],
  ["plate-puzzle", platePuzzleSceneJson],
  ["heightmap-demo", heightmapDemoSceneJson],
  ["grass-demo", grassDemoSceneJson]
]);
type MapName = "start" | "wide" | "corridor" | "corridors" | "cluster-rooms" | "plaza" | "cross" | "pit" | "belt-zone" | "warpfield" | "plate-puzzle" | "heightmap-demo" | "grass-demo";

/** S212 KABOOM-CAMERA-ADAPTIVE-FOLLOW — bounding-box width/depth (in
 *  tiles) of each authored arena. Used by the camera-control system
 *  to scale follow rate per axis: arenas that fit the view (pit,
 *  plaza Z) get a near-centred camera, large arenas (cross) follow
 *  normally. Values derived from the max GridPosition in each
 *  scene JSON; keep in sync when scene grids change. */
const MAP_DIMS: ReadonlyMap<MapName, { width: number; depth: number }> = new Map([
  ["start", { width: 14, depth: 10 }],
  ["wide", { width: 16, depth: 12 }],
  ["corridor", { width: 16, depth: 6 }],
  ["corridors", { width: 17, depth: 17 }],
  ["cluster-rooms", { width: 17, depth: 17 }],
  ["plaza", { width: 12, depth: 10 }],
  ["cross", { width: 17, depth: 17 }],
  ["pit", { width: 11, depth: 11 }],
  ["belt-zone", { width: 14, depth: 10 }],
  ["warpfield", { width: 15, depth: 11 }],
  ["plate-puzzle", { width: 15, depth: 11 }],
  ["heightmap-demo", { width: 14, depth: 10 }],
  ["grass-demo", { width: 14, depth: 10 }]
]);

/**
 * S205 — per-match map rotation pool. When a match ends (matchPhase
 * resolves), the next match steps to the next entry. Intra-match
 * rounds stay on the same arena so players don't switch venues
 * mid-best-of-N. Demo arenas (heightmap-demo, grass-demo) are
 * excluded — they exist for runtime feature tests, not playable
 * matches. URL `?map=X` overrides the rotation: when a map was
 * picked from the URL at boot, the rotation is suppressed and every
 * match restart uses the URL-picked map.
 */
const MATCH_ROTATION_POOL: ReadonlyArray<MapName> = [
  "start",
  "wide",
  "corridor",
  "corridors",
  "cluster-rooms",
  "plaza",
  "cross",
  "pit",
  "belt-zone",
  "warpfield",
  "plate-puzzle"
];
let mapLockedFromUrl = false;
let activeMapName: MapName = "start";

/** S205 — pure helper: returns the next map in the rotation given a
 *  monotonic match number (1-indexed). Exported for unit tests. */
export function rotatedMapForMatch(matchNumber: number, pool: ReadonlyArray<MapName> = MATCH_ROTATION_POOL): MapName {
  if (pool.length === 0) return "start";
  const idx = ((matchNumber - 1) % pool.length + pool.length) % pool.length;
  return pool[idx]!;
}
// Seed from `?map=` once at module load — module evaluation happens
// after the page is opened, so `location.search` is already valid.
function seedActiveMapFromUrl(): void {
  // S205 — when ?map= is explicitly set + valid, lock the map for the
  // entire session (no rotation). Otherwise rotation kicks in across
  // matches based on `MatchState.matchNumber`.
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search !== undefined && search.length > 0) {
    try {
      const value = new URLSearchParams(search).get("map");
      if (value !== null && MAP_REGISTRY.has(value)) {
        activeMapName = value as MapName;
        mapLockedFromUrl = true;
        return;
      }
    } catch {
      // fall through
    }
  }
  // No URL lock — start the rotation at match #1.
  activeMapName = rotatedMapForMatch(1);
  mapLockedFromUrl = false;
}

function readMapName(): MapName {
  return resolveSessionMap(
    (globalThis as unknown as { location?: { search?: string } }).location?.search,
    MAP_REGISTRY
  ) as MapName;
}

function buildFlatStartScene(map: MapName = activeMapName): SceneInput {
  const source = MAP_REGISTRY.get(map) as SceneInput | undefined;
  const resolved = (source ?? startSceneJson) as unknown as SceneInput;
  const expansion = expandScenePrefabs(resolved, PROJECT_PREFABS);
  if (expansion.diagnostics.length > 0) {
    // eslint-disable-next-line no-console
    // agf-allow:console scene expansion path runs before the runtime diagnostics bus is bound to attachUi.
    console.warn("[kaboom-crew] restart: scene expansion produced diagnostics", expansion.diagnostics);
  }
  return expansion.scene;
}

/**
 * S117 KABOOM-BOMBER-MATERIAL-PATCH — polls every animation frame for
 * procbomber + accessory mesh entities whose renderer handle exists but
 * hasn't had `vertexColors: true` applied yet. The engine's default
 * MeshStandardMaterial has vertexColors=false; without this patch the
 * per-vertex palette painted in the part-builder doesn't render.
 *
 * Idempotent via a per-entity Set. New meshes that appear after a
 * scene.load restart are picked up automatically — the world reference
 * doesn't change for the lifetime of the page, so the same handle
 * registry sees them.
 *
 * Cost: O(N) per frame where N = procbomber mesh count (~10/bomber × 4
 * bombers = ~40). String-prefix check + Set.has each. Negligible.
 */
function startVertexColorsPoller(runtime: RuntimeHandle): void {
  if (typeof requestAnimationFrame === "undefined") return; // SSR / node — no-op
  // S171 fix: key the patched-set by HANDLE id, not entity id. scene.load
  // recreates entities with the same string ids but fresh mesh handles —
  // the old per-entity guard was skipping the new handles, leaving the
  // new procedural meshes with vertexColors=false → textures looked
  // "missing" after restart, only the material's base colour rendered.
  const patchedHandles = new Set<number>();
  const tick = (): void => {
    try {
      const snap = runtime.snapshot();
      const registry = runtime.renderer.meshRegistry();
      for (const entity of snap.entities) {
        const mr = (entity.components as Record<string, { mesh?: string } | undefined>)["MeshRenderer"];
        const key = mr?.mesh;
        if (typeof key !== "string") continue;
        if (!key.startsWith("procedural:procbomber")
            && !key.startsWith("procedural:accessory-")
            && !key.startsWith("procedural:kaboom-hard-block")
            && !key.startsWith("procedural:kaboom-soft-block")
            && !key.startsWith("procedural:kaboom-floor-tile")
            && !key.startsWith("procedural:kaboom-grass")) continue;
        const handle = registry.handleFor(entity.id);
        if (handle === undefined) continue;
        if (patchedHandles.has(handle)) continue;
        runtime.renderer.adapter.setMeshMaterialPatch(handle, { vertexColors: true });
        patchedHandles.add(handle);
      }
    } catch {
      // best-effort — first frames before runtime is fully ready may
      // surface transient errors; skip and try again next frame.
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** S218 — rAF poller that mirrors `ArenaTheme.themeKey` from
 *  `kaboom.game-state` into the vignette overlay's tint. Single
 *  snapshot read per frame; CSS write happens only when the
 *  theme key actually flips, so the steady-state cost is one Map
 *  lookup + a string compare. */
function startVignetteThemeTintPoller(
  runtime: RuntimeHandle,
  baseOptions: KaboomVignetteOptions
): void {
  if (typeof requestAnimationFrame === "undefined") return;
  let lastKey: string | undefined;
  const tick = (): void => {
    try {
      const snap = runtime.snapshot();
      const gs = snap.entities.find((e) => e.id === "kaboom.game-state");
      const themeRaw = (gs?.components as Record<string, { themeKey?: string } | undefined> | undefined)?.["ArenaTheme"]?.themeKey;
      if (typeof themeRaw === "string" && themeRaw !== lastKey && isArenaThemeKey(themeRaw)) {
        const tint = ARENA_THEMES[themeRaw].ambientHemisphericGround;
        applyVignetteTint(tint, baseOptions);
        lastKey = themeRaw;
      }
    } catch {
      // best-effort — early ticks may surface transient errors.
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function restartScene(runtime: RuntimeHandle): number {
  // S84 KABOOM-SCORING-HUD. Read tally + roundNumber out of the live
  // world before scene.load wipes everything, then re-seed the new
  // RoundState with bumped numbers so the persistent score line
  // survives the auto-restart.
  // S87 KABOOM-MATCH-BEST-OF-5 — if the match is over (matchPhase !=
  // in-progress) and the user hits R, restart starts a fresh match:
  // tally cleared, roundNumber reset to 1.
  const snap = runtime.snapshot();
  const prevRound = snap.entities.find((e) => e.id === "kaboom.round-state");
  const prev = prevRound?.components["RoundState"] as
    | { roundNumber?: number; tally?: { player: number; bot: number; draws: number }; matchPhase?: string; matchTarget?: number }
    | undefined;
  // S115 KABOOM-MATCH-STRUCTURE — read the canonical MatchState entity.
  const prevGameState = snap.entities.find((e) => e.id === "kaboom.game-state");
  const prevMatch = prevGameState?.components["MatchState"] as
    | { phase?: string; target?: number; matchNumber?: number; lastMatchWinner?: string }
    | undefined;
  const matchOver = prevMatch?.phase === "resolved" || (prev?.matchPhase !== undefined && prev.matchPhase !== "in-progress");
  const nextRoundNumber = matchOver ? 1 : (prev?.roundNumber ?? 1) + 1;
  const tally = matchOver ? { player: 0, bot: 0, draws: 0 } : (prev?.tally ?? { player: 0, bot: 0, draws: 0 });
  // S115 — bump matchNumber when a match just resolved; persist target.
  const nextMatchNumber = matchOver ? (prevMatch?.matchNumber ?? 1) + 1 : (prevMatch?.matchNumber ?? 1);
  const matchTarget = prevMatch?.target ?? prev?.matchTarget ?? readMatchTargetFromUrl() ?? 3;
  // S205 — when a match just resolved + no URL map lock, rotate to the
  // next arena in the pool. Intra-match restarts (matchOver=false)
  // keep the current map so the players don't switch venues
  // mid-best-of-N.
  if (matchOver && !mapLockedFromUrl) {
    activeMapName = rotatedMapForMatch(nextMatchNumber);
  }
  // S84 KABOOM-BOT-DIFFICULTY. Re-apply the URL preset on every
  // restart so a difficulty change without reload still kicks in next
  // round. Browser-only — `globalThis.location` is undefined in node.
  const preset = readDifficultyFromUrl(
    (globalThis as unknown as { location?: { search?: string } }).location?.search
  );
  const personality = resolveSessionBotPersonality(
    (globalThis as unknown as { location?: { search?: string } }).location?.search
  );
  const tuning = difficultyComponentPatch(preset);
  // S173 GDP-2026-05-28-010 — build the scene up front so the heightmap
  // post-pass can read its top-level `heightmap` field + lift bomber/
  // block Y values to match. The applyHeightmapCommands helper returns
  // an empty list on flat arenas so scenes without a heightmap pay zero
  // overhead.
  const restartScene_ = buildFlatStartScene();
  const restartThemeKey: ArenaThemeKey =
    readArenaThemeFromUrl() ?? defaultThemeForArena(activeMapName);
  const heightmapCommands_ = applyHeightmapCommands(restartScene_, restartThemeKey);
  // S176 KABOOM-FLOOR-WANG-TILES MVP — promote the source scene's
  // optional top-level `terrainmap` field into per-cell floor-overlay
  // entities. Scenes without a terrainmap return an empty list so
  // flat arenas pay zero overhead.
  const terrainmapCommands_ = applyTerrainmapCommands(restartScene_);
  runtime.applyCommands([
    { kind: "scene.load", scene: restartScene_ },
    ...heightmapCommands_,
    ...terrainmapCommands_,
    {
      kind: "entity.create",
      entityId: "kaboom.round-state",
      components: {
        RoundState: { phase: "playing", elapsed: 0, roundNumber: nextRoundNumber, tally, timeLimit: readRoundTimeLimit(), matchTarget, matchPhase: "in-progress" }
      }
    },
    // S115 KABOOM-MATCH-STRUCTURE — separate singleton so the dev
    // panel + HUD + future server can read match-level state without
    // walking the round-state entity.
    {
      kind: "entity.create",
      entityId: "kaboom.game-state",
      components: {
        MatchState: { phase: "playing", target: matchTarget, matchNumber: nextMatchNumber },
        // S160 KABOOM-SUDDEN-DEATH — re-seed config on every restart
        // so the URL flags (?suddenDeath=off, ?suddenDeathTriggerS=N)
        // persist across rounds. SuddenDeathState is intentionally NOT
        // re-seeded — the system creates it lazily on activation, and
        // the previous round's state should NOT carry over.
        SuddenDeathConfig: { ...readSuddenDeathFromUrl(), ringIntervalS: 2, ringWidth: 1 },
        // S171 KABOOM-ARENA-THEMES MVP — re-seed on restart so the URL
        // flag (?theme=...) and the per-arena default survive the
        // scene.load wipe. Arena defaults look up by the (possibly-
        // updated) activeMapName.
        ArenaTheme: { themeKey: readArenaThemeFromUrl() ?? defaultThemeForArena(activeMapName) }
      }
    },
    // S100 + S141 — apply the difficulty + personality patch to all
    // three solo bots. Connected mode keeps the single-bot path:
    // server owns bot.1, the scene also spawns bot.2 + bot.3 so we
    // delete every solo-bot id to let the server's snapshot land
    // without collisions. The S139 URL-override `personality` is
    // intentionally ignored here because the multi-bot default
    // assigns one of each — the override flag re-purposes itself for
    // future single-bot networked rounds.
    ...(_networkedMode
      ? MULTI_BOT_IDS.map((id) => ({ kind: "entity.delete", entityId: id } as EngineCommand))
      : MULTI_BOT_ASSIGNMENT.flatMap(({ id, personality: p }) => [
          { kind: "component.set", entityId: id, component: "BotBrain", data: { ...tuning.BotBrain, personality: p } } as EngineCommand,
          { kind: "component.set", entityId: id, component: "BomberStats", data: tuning.BomberStats } as EngineCommand,
          { kind: "component.set", entityId: id, component: "GridMover", data: tuning.GridMover } as EngineCommand
        ]))
  ]);
  void personality; // S141 — kept in scope for future networked-mode single-bot use.
  // S104 KABOOM-MIGRATE-PREFABS — scene.load WIPES the world including
  // the 19-entity bomber trees from the previous round. Re-spawn here
  // so the next round renders bombers. The procedural mesh registry
  // persists across scene.load (renderer-level), so the per-part
  // builders stay registered.
  // S156 — filter accessories to the unlocked subset when the profile
  // store is bound (i.e. after attachUi). Pre-bind path falls back to
  // the default 5-kind pool.
  const unlockedKinds = _boundProfileStore !== undefined
    ? unlockedAccessoryKinds(_boundProfileStore.get().cosmeticUnlocks)
    : undefined;
  const playerRecipe = makeKaboomRecipe(
    "player.1",
    undefined,
    unlockedKinds !== undefined ? { unlockedAccessoryKinds: unlockedKinds } : {}
  );
  spawnBomberFor((cmds) => runtime.applyCommands(cmds), "player.1", playerRecipe);
  // S120 — on connected, the server owns bot.1; the snapshot delivers
  // it and remote-bomber-decorator spawns the procbomber tree locally.
  // Spawning here would collide with the server's claim. S141 — bot.2
  // and bot.3 are solo-only; the connected delete above wiped them.
  if (!_networkedMode) {
    for (const { id, personality: p } of MULTI_BOT_ASSIGNMENT) {
      const botRecipe = makeKaboomRecipe(id, p);
      spawnBomberFor((cmds) => runtime.applyCommands(cmds), id, botRecipe);
    }
  }
  return 1;
}

// Late-bound restart callback. registerSystems runs before attachUi, so
// the runtime handle isn't available when RoundResolveSystem is built —
// the system holds this closure and attachUi populates `_boundRestart`
// once the runtime is known. Cleared in dispose to release the handle.
let _boundRestart: (() => void) | undefined;
// S120 KABOOM-MP-SPRINT-B chunk 4 — when running on the connected
// profile, the server owns bot.1 — local bootstrap must skip the
// local bot.1 spawn so the snapshot's server bot.1 entity isn't
// rejected by the ws-adapter's id-collision guard.
let _networkedMode = false;

// S129 KABOOM-CREW ragdoll foundation — register the kaboom-bomber
// template at module load so the engine ragdoll spawn-system can find
// it the first time a death triggers a RagdollSpawnRequest. try/catch
// the duplicate-key error so HMR re-imports don't throw.
try {
  registerRagdollTemplate(KABOOM_BOMBER_RAGDOLL_KEY, KABOOM_BOMBER_RAGDOLL);
} catch (error) {
  if (!String(error).includes("duplicate key")) throw error;
}

// S87 KABOOM-HUD-KEY-GLYPHS. PlayerInputSystem already exposes
// pressedSnapshot(); we hold the instance so attachUi can expose a
// `runtime.kaboom.input()` accessor (returns ReadonlyArray<string>)
// and the HUD key-glyph widget can poll the live pressed set.
let _boundPlayerInput: { pressedSnapshot(): ReadonlySet<string> } | undefined;

// S90 KABOOM-MINIMAP-DANGER-OVERLAY. Captured during registerSystems
// so the per-frame minimap update can project live blast cells. The
// occupancy query is the same one bomb-place / blast-propagation /
// bot-ai use.
let _boundOccupancy: import("../../engine/core/systems/grid-occupancy-system").GridOccupancyQuery | undefined;

// S84 KABOOM-AUDIO-WIRE.
// Same closure-bridge pattern: audio-binding system is registered in
// registerSystems but the audio bus only exists once attachUi has
// the runtime handle. attachUi populates `_boundAudioEvent`; the
// binding system calls through it. `audioLog` mirrors every event so
// the probe surface (`__agf.kaboom.audioLog`) can verify the sequence
// without depending on the HTMLAudioElement state.
type AudioLogEntry = { kind: AudioEventKind; entityId?: string; ts: number };
let _boundAudioEvent: ((kind: AudioEventKind, ctx?: { entityId?: string; position?: readonly [number, number, number] }) => void) | undefined;
let _audioLog: AudioLogEntry[] = [];
// S156 — module-level profile store handle. Created in attachUi;
// restartScene() reads it to filter the player.1 recipe's accessory
// pool to the unlocked subset (when available; missing → no filter).
let _boundProfileStore: ProfileStore | undefined;

export const kaboomCrewBootstrap: ProjectBootstrap = {
  registerSystems({ scheduler, playerId, networked, getNetwork }: ProjectBootstrapContext): void {
    _networkedMode = networked;
    const _followMode: FollowMode = readFollowModeFromUrl();
    const occupancy = createGridOccupancySystem();
    _boundOccupancy = occupancy;
    scheduler.register(occupancy, { profiles: ["static", "connected"] });

    // S235 walk-through-bomb fix (GDP-2026-06-02-003). bomb-block-system
    // must fire BEFORE grid-movement-system in frameUpdate phase: if it
    // doesn't, grid-movement consumes queuedDirection + starts a cell-
    // tween toward the bomb cell, and bomb-block's later safety check
    // (`if (mover.targetGx !== undefined) continue`) skips the bomber.
    // Player walks through bombs without bombPass.
    // Registration order = execution order per `scheduler.runFrame` —
    // move bomb-block to the slot right after occupancy.
    scheduler.register(createKaboomBombBlockSystem({ occupancy }), { profiles: ["static", "connected"] });

    scheduler.register(createGridMovementSystem({ occupancy }), { profiles: ["static", "connected"] });
    // S178 KABOOM-BOMBER-HEIGHT-LIFT — keep bombers/bombs/pickups Y in
    // sync with the cell they stand on. Runs AFTER grid-movement so
    // the Y-write lands on the post-tween GridPosition.
    scheduler.register(createKaboomBomberHeightLiftSystem(), { profiles: ["static", "connected"] });
    // S183 KABOOM-STEP-JUMP-LANDING-FX — dust puff particle emitter
    // when a bomber crosses a cell whose height differs by ±1 from
    // the previous cell. Runs after height-lift so the puff lands on
    // the post-tween GridPosition.
    scheduler.register(createKaboomStepJumpFxSystem(), { profiles: ["static", "connected"] });
    // S191 KABOOM-PICKUP-HOVER-SPIN — gentle hover + slow Y spin on
    // pickup items so they read as collectibles at a glance. Runs
    // after height-lift so its bob layers on top of the cell-height
    // offset; phase per-entity so a cluster of pickups doesn't bob in
    // lockstep.
    scheduler.register(createKaboomPickupHoverSpinSystem(), { profiles: ["static", "connected"] });
    // S200 KABOOM-PICKUP-MAGNET — pickups within 1.5 cells of an alive
    // bomber slide visually toward them. GridPosition stays put;
    // collection still happens cell-by-cell via pickup-collect-system.
    // Touches Transform X/Z; hover-spin owns Y/rotation, so the two
    // systems compose without fighting over the same axes.
    scheduler.register(createKaboomPickupMagnetSystem(), { profiles: ["static", "connected"] });
    // S165 KABOOM-MULTI-VARIANT-BLOCKS + S170 KABOOM-WANG-INTEGRATION —
    // stamp WangTile + WangTileFamilyMember on every hard / soft block
    // cell. The engine resolver (registered immediately below) computes
    // the Wang bitmask + writes currentVariantIndex; the mesh-sync
    // bridge after it rewrites MeshRenderer.mesh to the per-variant
    // procedural key (procedural:kaboom-hard-block-N).
    //
    // Run order matters: variant-system → resolver → mesh-sync. The
    // first stamps the tags; the second resolves the bitmask; the
    // third propagates the variant index into the renderer.
    scheduler.register(createKaboomBlockVariantSystem(), { profiles: ["static", "connected"] });
    scheduler.register(
      createWangTileResolverSystem({ name: "engine.wang-tile-resolver" }),
      { profiles: ["static", "connected"] }
    );
    scheduler.register(createKaboomWangMeshSyncSystem(), { profiles: ["static", "connected"] });
    // S171 KABOOM-ARENA-THEMES MVP (GDP-2026-05-28-013) — re-tint the
    // floor entity's MeshRenderer.color from the active theme. Reads
    // ArenaTheme.themeKey off the kaboom.game-state singleton; bootstrap
    // seeds it from the URL flag / per-arena default in the initialBatch
    // + restartScene paths below. Runs once per world; cheap.
    scheduler.register(createArenaThemeApplySystem(), { profiles: ["static", "connected"] });
    const playerInput = createKaboomPlayerInputSystem();
    _boundPlayerInput = playerInput;
    scheduler.register(playerInput, { profiles: ["static", "connected"] });

    // S104 KABOOM-BOMBER-ANIMATION-PROD + KABOOM-REACH-IK-PLACE-BOMB —
    // runs RIGHT AFTER player-input so it sees the PlaceBombRequest
    // transient before bomb-placement-system removes it. Drives
    // BenchAnimationState.kind from gameplay (idle / walk / reach /
    // death). The animation system that READS the kind is the bench
    // module — registered below alongside the rest of the renderer
    // adapters.
    scheduler.register(createKaboomBomberAnimationDriverSystem(), { profiles: ["static", "connected"] });
    // S108 KABOOM-BOMBER-FACE-MOVEMENT — root Y rotation tracks GridMover.
    scheduler.register(createKaboomBomberFaceMovementSystem(), { profiles: ["static", "connected"] });
    // S277/S280 KABOOM-OUTLINE-OCCLUDER — see-through bomber + bomb
    // silhouettes when occluded by walls / hard blocks. Each system
    // spawns outline-duplicate entities carrying the engine
    // `OutlineOccluder` component; `render.outline-prepass` builds a
    // bomber-excluded depth target and `render.outline-occluder`
    // swaps in the WebGPU NodeMaterial that samples it.
    // URL gate `?occluderOutline=off` disables; default ON.
    if (resolveOccluderOutlineEnabled()) {
      scheduler.register(createKaboomBomberOutlineSystem(), { profiles: ["static", "connected"] });
      scheduler.register(createKaboomBombOutlineSystem(), { profiles: ["static", "connected"] });
    }

    // Bomb pipeline.
    // S117 KABOOM-MP-SPRINT-B — on the connected profile the relay runs
    // BEFORE bomb-placement-system, intercepts the local player's
    // PlaceBombRequest transients, sends placeBombRequest to the server
    // and strips the transient so the local placement never spawns a
    // duplicate. Bots + other entities fall through to local placement.
    scheduler.register(
      createKaboomPlaceBombNetworkRelaySystem({ getNetwork }),
      { profiles: ["connected"] }
    );
    // S120 KABOOM-MP-SPRINT-B chunk 4 — on connected the server is
    // authoritative on bomb spawning (the relay above forwards local
    // human bomb requests + bots are server-side). Local placement
    // would never get to spawn anything useful.
    scheduler.register(createKaboomBombPlacementSystem({ occupancy }), { profiles: ["static"] });
    // S100 KABOOM-KICK-POWER-UP — runs after player-input populates
    // queuedDirection, before grid-movement commits the step.
    scheduler.register(createKaboomBombKickSystem({ occupancy }), { profiles: ["static", "connected"] });
    // S144 KABOOM-THROW-GLOVE — pickup + throw systems run before
    // fuse-system so a carried/airborne bomb has its carriedBy /
    // airborne flag set in time to skip the fuse decrement this tick.
    scheduler.register(createKaboomBombPickupSystem(), { profiles: ["static"] });
    scheduler.register(createKaboomBombThrowSystem({ occupancy }), { profiles: ["static"] });
    // S159 KABOOM-DASH — consumes Shift+direction DashRequest transients;
    // arcs the bomber 2 cells in 200ms over an arc; 3s cooldown.
    scheduler.register(createKaboomDashSystem(), { profiles: ["static"] });
    // S197 KABOOM-DASH-TRAIL — co-spawn a short-lived 'glow' emitter
    // every ~35ms while BomberStats.dashing is true, so the dash
    // reads as a comet tail along the arc.
    scheduler.register(createKaboomDashTrailSystem(), { profiles: ["static", "connected"] });
    // S146 KABOOM-CONVEYOR-BELT — push bombers + bombs along belt
    // direction. Runs BEFORE bomb-fuse-system so a belt push on the
    // same tick a bomb detonates updates GridPosition first.
    scheduler.register(createKaboomConveyorBeltSystem({ occupancy }), { profiles: ["static"] });
    // S149 KABOOM-WARP-HOLE — instant cross-arena teleport. Runs AFTER
    // conveyor-belt so a belt-push that lands on a warp cell triggers
    // the teleport in the same tick. Before bomb-fuse so a bomb that
    // warps THIS tick is at its destination by the time the fuse
    // resolves to zero next tick.
    scheduler.register(createKaboomWarpHoleSystem({ occupancy }), { profiles: ["static"] });
    // S151 KABOOM-PRESSURE-PLATE — triggers configured actions on
    // occupancy with per-plate cooldown. Runs AFTER warp-hole so a
    // bomber that warps onto a plate triggers in the same tick.
    scheduler.register(createKaboomPressurePlateSystem({ occupancy }), { profiles: ["static"] });
    // S117 KABOOM-MP-SPRINT-B — fuse-system stays on the static path
    // only. On the connected profile the server is authoritative on the
    // fuse + emits blastEvent when it hits zero; running the local fuse
    // would double-detonate.
    scheduler.register(createKaboomBombFuseSystem(), { profiles: ["static"] });
    // S196 KABOOM-BOMB-FUSE-COLOR — visual telegraph in the final
    // 0.6s of fuse: lerp the bomb's MeshRenderer.color toward bright
    // orange so the player can read 'about to blow' at a glance,
    // independent of the S90 scale wiggle. Runs on both profiles
    // (visual only, server-authoritative fuse on connected still
    // drives bomb.fuseRemaining the same way).
    scheduler.register(createKaboomBombFuseColorSystem(), { profiles: ["static", "connected"] });
    // S84 KABOOM-AUDIO-WIRE — register BEFORE blast-propagation so the
    // binding system sees the BlastEvent transient before propagation
    // consumes it. The late-bound closure indirects to attachUi where
    // the audio bus is finally available.
    scheduler.register(
      createKaboomAudioBindingSystem({
        onEvent(kind, c): void {
          if (_boundAudioEvent !== undefined) _boundAudioEvent(kind, c);
        },
        // S267 — `?stepJumpAudio=off` disables the launch/land cues
        // (useful for snapshot tests + a quieter SFX mode).
        stepJumpAudioEnabled: readStepJumpAudioFromUrl()
      }),
      { profiles: ["static", "connected"] }
    );

    // S195 KABOOM-CAMERA-CONTROL — single-owner of camera.main
    // Transform.position. Combines the S87/S95 shake (intact feel)
    // with a new damped follow on player.1. URL flag ?follow=off|snap
    // picks the follow mode at boot. The combined system is the
    // antidote to S163-doubling: ONE write per fixedUpdate, no
    // frameUpdate path.
    // S212 KABOOM-CAMERA-ADAPTIVE-FOLLOW — feed the current arena
    // dims + view-tile width into the camera system so the follow
    // rate scales per axis. The thunk reads the live activeMapName
    // so a mid-session restart (per-match rotation, ?map=) updates
    // dims without re-registering the system.
    const adaptiveCamera = readAdaptiveCameraFromUrl();
    const spawnFlicker = readSpawnFlickerFromUrl();
    scheduler.register(
      createKaboomCameraControlSystem({
        followMode: _followMode,
        arenaSize: () => MAP_DIMS.get(activeMapName),
        viewTilesWide: adaptiveCamera.viewTilesWide,
        minParallax: adaptiveCamera.minParallax,
        adaptiveDisabled: adaptiveCamera.disabled,
        spawnFlickerDisabled: spawnFlicker.disabled,
        spawnFlickerDurationS: spawnFlicker.durationS,
        spawnFlickerYOffset: spawnFlicker.yOffset
      }),
      {
        profiles: ["static", "connected"]
      }
    );
    // S194 KABOOM-CAMERA-ZOOM-ON-ACTION — orthographicSize eases out
    // when bombs / blast tiles are active or sudden death is on; eases
    // back when the arena quiets. No position lerp (S163 doubling
    // risk) — only the projection scalar.
    scheduler.register(createKaboomCameraZoomSystem(), { profiles: ["static", "connected"] });

    // S132 KABOOM-DEATH-TRIGGER (replaces the S90/S105 procedural-spring
    // path). Watches BomberStats.alive true→false; detaches the 10
    // procedural meshes from their pivot parents, builds a meshMap,
    // reads DeathImpulse for the blast direction, and writes a
    // RagdollSpawnRequest on the bomber root. The engine ragdoll
    // module (registered by src/app.ts when physics.enabled=true)
    // consumes the request next tick and owns the visual ragdoll
    // from there on. Must run BEFORE audio-binding-system so the
    // ragdoll spawns on the same frame as the death audio.
    scheduler.register(createKaboomDeathTriggerSystem(), { profiles: ["static", "connected"] });

    // S208 KABOOM-LOOT-DROP (GDP-2026-05-30-001) — watch the same
    // alive: true → false edge the death-trigger uses and spawn ~half
    // of the bomber's stats as pickups at their death cell. A second
    // system below ticks the dropped pickups' lifetime so they
    // despawn after 30 s if no one grabs them.
    {
      const params = readLootDropParamsFromUrl();
      scheduler.register(
        createKaboomDeathPickupDropSystem({
          disabled: params.disabled,
          capPerDeath: params.cap,
          lifetimeS: params.lifetimeS,
          booleanRatio: params.booleanRatio
        }),
        { profiles: ["static", "connected"] }
      );
      scheduler.register(createKaboomLootDropDecaySystem(), { profiles: ["static", "connected"] });
    }

    // S226 KABOOM-DEATH-BOMB-DROP (GDP-2026-06-02-001) — every
    // bomber death auto-spawns ONE bomb in a cardinal-adjacent
    // cell (or the death cell as fallback). Owner = dead bomber
    // (kill credit posthumously). Simpler replacement for the
    // S211/S219 revenge-cart click-to-throw flow.
    {
      const params = readDeathBombParamsFromUrl();
      scheduler.register(
        createKaboomDeathBombDropSystem({
          occupancy,
          disabled: params.disabled,
          range: params.range,
          // Bounds-aware so death bombs never spawn off-screen
          // when the ragdoll lands near an arena edge.
          arenaSize: () => MAP_DIMS.get(activeMapName)
        }),
        { profiles: ["static", "connected"] }
      );
    }

    // S211 KABOOM-REVENGE (GDP-2026-05-30-002 V1) — dead bombers
    // keep participating: a RevengeState appears on the alive →
    // false edge, and the bomber can launch bombs at arbitrary
    // cells via RevengeBombRequest. Dead bots auto-fire on the
    // nearest alive bomber. URL `?revenge=off` disables.
    {
      const params = readRevengeParamsFromUrl();
      const revengeOpts: Parameters<typeof createKaboomRevengeSystem>[0] = {
        disabled: params.disabled,
        bombsBudget: params.bombsBudget,
        cooldownS: params.cooldownS,
        // S219 — bot auto-fire defaults to ON (arc telegraph in place).
        // Explicit URL `?revengeBotAi=off` is the new opt-out;
        // `params.botAutoFire` flips true only when `?revengeBotAi=on`,
        // so threading via setter handles the off-only override.
        arenaSize: () => MAP_DIMS.get(activeMapName),
        arcDurationS: params.arcDurationS
      };
      if (params.botAutoFire === false) revengeOpts.botAutoFire = false;
      scheduler.register(createKaboomRevengeSystem(revengeOpts), { profiles: ["static", "connected"] });
    }

    // S104 KABOOM-BOMBER-ANIMATION-PROD — bench-animation-system reads
    // BenchAnimationState + LimbPivots (written by the driver above + by
    // spawnBomberFor) and drives the per-limb rotations. Same module
    // the procbomber-bench uses; in production the driver decides the
    // kind, the system performs the motion.
    scheduler.register(createBenchAnimationSystem(), { profiles: ["static", "connected"] });
    // S106 KABOOM-ACCESSORY-SOFT-ATTACH-SWAY — runs BEFORE the spring
    // system so its nudges accumulate into SpringPivot.velocity, which
    // the spring system then decays back to rest.
    scheduler.register(createSoftAttachSwaySystem(), { profiles: ["static", "connected"] });
    // S135 FIX-ACCESSORY-SWAY-IN-KABOOM — read SpringPivot.velocity
    // and decay it into accessory Transform.rotation. Was de-registered
    // in S132 alongside the orphaned death-animation-system; result:
    // accessories silently froze (soft-attach-sway kept writing nudges
    // but nothing consumed them). Re-registered for accessory sway on
    // alive bombers AND, as a side effect, during ragdoll motion the
    // soft-attach nudges from head/torso mesh motion produce visible
    // sway on the 5 procedural accessories — the visually-correct
    // outcome rather than the prior 'freeze in mid-air' fear.
    scheduler.register(createSpringPivotSystem(), { profiles: ["static", "connected"] });

    // S120 KABOOM-MP-SPRINT-B chunk 4 — server walks blast cells +
    // emits blastEvent + blockDestroyed (S118). Local blast-propagation
    // never sees a BlastEvent transient on connected (local fuse-system
    // is also off since S117), so this is also a cleanup of an idle
    // system. Narrow to ['static'] explicitly.
    scheduler.register(createKaboomBlastPropagationSystem({ occupancy }), { profiles: ["static"] });
    // S192 KABOOM-SOFT-BLOCK-DEBRIS — runs after blast propagation
    // emits SoftBlockDestroyedEvent so the debris chunks spawn on the
    // same tick the block disappears. Co-spawns 6 small box chunks
    // with kinematic AccessoryDebris integration (engine reuse).
    scheduler.register(createKaboomSoftBlockDebrisSystem(), { profiles: ["static", "connected"] });
    // S109 KABOOM-HIT-RECOIL — runs RIGHT AFTER blast propagation so the
    // HitRecoilRequest transient blast-propagation just wrote is consumed
    // in the same fixedUpdate (one-shot, no carry-over).
    scheduler.register(createKaboomHitRecoilSystem(), { profiles: ["static", "connected"] });
    // S121 — connected-blast-decoder now spawns BlastTile entities
    // from server's blastEvent.cells; this system decays them.
    scheduler.register(createKaboomBlastTileLifetimeSystem({ occupancy }), { profiles: ["static", "connected"] });
    // S213 KABOOM-SCORCH-V2 — long-lived (~3 s) dark soot marks
    // co-spawned with each blast tile. Geometry-only fade (engine
    // Tween shrinks scale on Transform); this system owns just the
    // GC pass.
    scheduler.register(createKaboomScorchTileLifetimeSystem(), { profiles: ["static", "connected"] });
    // S98 KABOOM-BLAST-DANGER-DECAL — reverted in S99 per user
    // feedback (design choice rejected in principle; see
    // feedback-no-blast-prediction-decal memory).

    // S82 KABOOM-PICKUPS-AND-STATS. Spawn runs in fixedUpdate AFTER
    // blast-propagation so it sees the SoftBlockDestroyedEvent
    // transients from this step. Collect runs alongside in fixedUpdate
    // so a bomber walking onto a pickup is picked up on the same step.
    // S119 KABOOM-MP-SPRINT-B — on the connected profile the server is
    // authoritative on pickup spawn AND collect (FEAT-SERVER-PICKUP-*).
    // Local pickup-spawn still wouldn't fire on connected (no local
    // SoftBlockDestroyedEvent — local blast-propagation is idle), but
    // narrowing the profile documents the intent. Local pickup-collect
    // MUST be dropped: it would otherwise double-apply stats to player.1
    // on top of the server-authoritative path.
    scheduler.register(createKaboomPickupSpawnSystem({ seed: 0xc0ffee }), { profiles: ["static"] });
    scheduler.register(createKaboomPickupCollectSystem({ occupancy }), { profiles: ["static"] });

    // Bot AI runs in fixedUpdate so per-frame variance doesn't change
    // decisions; seeded RNG keeps replay recordings reproducible.
    // S120 KABOOM-MP-SPRINT-B chunk 4 — on connected, the server is
    // authoritative on bot AI. The local bot-AI would otherwise drive
    // a phantom local bot.1 — but we suppress that spawn entirely
    // (FEAT-CLIENT-SUPPRESS-LOCAL-BOT-001).
    {
      const accel = readBotAccelerationFromUrl();
      scheduler.register(
        createKaboomBotAISystem({
          occupancy,
          seed: 1337,
          accelerationDisabled: accel.disabled,
          accelerationBaseBoost: accel.baseBoost
        }),
        { profiles: ["static"] }
      );
    }

    // (S152 bomb-block registration moved to right after occupancy in
    // S235 walk-through fix — see comment near line 928.)

    // Round resolve gets a late-bound onRestart closure so it can fire
    // the auto-restart timer (default 3 s after win/loss/draw) without
    // requiring the player to press R. The runtime handle becomes
    // available in attachUi, which populates `_boundRestart`.
    // S119 KABOOM-MP-SPRINT-B chunk 7 — on connected, the server is
    // authoritative on round-resolve. The connected-blast-decoder
    // applies roundResolved events into the local kaboom.round-state
    // singleton so the HUD scoreboard reads the same state as static.
    scheduler.register(
      createKaboomRoundResolveSystem({
        playerId: "player.1",
        autoRestartAfterMs: 3000,
        onRestart: (): void => {
          if (_boundRestart !== undefined) _boundRestart();
        }
      }),
      { profiles: ["static"] }
    );
    // S199 KABOOM-ROUND-CELEBRATION-FX — spawns a particle burst at
    // the winner on the round-phase transition. Runs after round-
    // resolve so the new RoundState.phase / winnerId are visible.
    scheduler.register(createKaboomRoundCelebrationFxSystem(), { profiles: ["static", "connected"] });
    // S160 KABOOM-SUDDEN-DEATH — runs after round-resolve so phase-flip
    // wins over a new ring spawn on the resolving tick.
    scheduler.register(createKaboomSuddenDeathSystem(), { profiles: ["static"] });
    // S261 KABOOM-RANDOM-LAYOUT (GDP-2026-06-02-006). Opt-in: reroll
    // soft-block positions on each round start while keeping the hard-
    // block skeleton + spawn corners fixed. URL: `?randomLayout=on`.
    scheduler.register(
      createKaboomSoftBlockShuffleSystem({
        enabled: readRandomLayoutFromUrl(),
        sceneSeed: 0
      }),
      { profiles: ["static"] }
    );

    // S162 KABOOM-ACCESSORY-DETACH — runs every fixedUpdate. Spawns
    // AccessoryDebris on bomber death, then integrates active debris.
    scheduler.register(createKaboomAccessoryDetachSystem(), { profiles: ["static"] });
    // S163-revert: camera-follow system unregistered (doubling artifact).

    // S82 KABOOM-AGENT-CONTROLS: drives any entity with AgentGoto
    // toward the target cell. Used by `runtime.kaboom.gotoCell` (wired
    // in attachUi) and by future bot playtests. Pass `occupancy` so
    // the system fails fast with `unreachable` when the caller targets
    // a blocked cell (hard / soft wall) instead of forever trying.
    scheduler.register(createKaboomAgentGotoSystem({ occupancy }), { profiles: ["static", "connected"] });

    // S109 KABOOM-MULTIPLAYER-FOUNDATION — connected-profile-only
    // systems. The local bomber's gameplay (grid-movement, bomb
    // placement, blast propagation, etc.) all stay on the static path
    // above. The network adapter mirrors the local bomber's intent
    // over the wire + synthesises remote-player entities from inbound
    // snapshots; the two systems below decorate + interpolate them so
    // they read as actual bombers walking around the arena instead of
    // disembodied server-owned dots.
    if (networked) {
      // S118 KABOOM-MP-SPRINT-B chunk 2 — connected-only decoder that
      // converts server-side blockDestroyed events into local
      // entity.delete on the matching soft.* entities.
      scheduler.register(
        createKaboomConnectedBlastDecoderSystem({ getNetwork }),
        { profiles: ["connected"] }
      );
      scheduler.register(
        createKaboomRemoteBomberDecoratorSystem({ localPlayerId: playerId }),
        { profiles: ["connected"] }
      );
      const interpolatorClock = (): number =>
        typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000;
      scheduler.register(
        createKaboomRemoteBomberInterpolatorSystem({
          localPlayerId: playerId,
          getSnapshotBuffer: () => getNetwork()?.getSnapshotBuffer() ?? new Map(),
          nowSeconds: interpolatorClock
        }),
        { profiles: ["connected"] }
      );
    }
  },

  attachUi({ runtime }: ProjectUiContext): ProjectUiHandle {
    // S89 KABOOM-AGENT-MAP-LIST. Pick up `?map=` from the URL before
    // any restartScene call so the very first scene.load already uses
    // the right map (matches the legacy S86 behaviour where
    // buildFlatStartScene re-read the URL each call).
    seedActiveMapFromUrl();

    // S217 KABOOM-VIGNETTE-OVERLAY — pure-DOM radial darkening at
    // screen edges. Backend-agnostic (the S216 engine pass only
    // fires on WebGL, and Kaboom Crew runs WebGPU primary).
    // `?vignette=off` skips the mount.
    // S218 — tint the gradient with the active arena theme's
    // ambient ground colour. A small rAF poller watches the
    // game-state ArenaTheme; on theme key change it re-applies
    // the tint. Cost: one snapshot read per frame, only updates
    // CSS when the theme actually changes.
    {
      const opts = readVignetteOptionsFromUrl();
      if (opts !== undefined) {
        mountVignetteOverlay(opts);
        startVignetteThemeTintPoller(runtime, opts);
      }
    }

    // S156 KABOOM-COSMETIC-UNLOCKS — bring up the profile store FIRST
    // so the player.1 recipe spawn below can read cosmeticUnlocks and
    // filter accessories accordingly. Storage is the same DOM
    // localStorage the audio-volume code uses; passing nothing leaves
    // the store in-memory-only (HMR / no-DOM tests).
    {
      const ls = (globalThis as unknown as { localStorage?: Storage }).localStorage;
      _boundProfileStore = createProfileStore(ls !== undefined ? { storage: ls } : {});
      _boundProfileStore.get(); // hydrate + bump lastSeenAt
    }

    _boundRestart = (): void => {
      restartScene(runtime);
    };

    // S88 KABOOM-DROP-LOCAL-WARMUP. The previous S85 hack — spawning a
    // hidden `kaboom.warmup-particles` ParticleEmitter offscreen to
    // pre-compile the shader — is now superseded by the engine-level
    // `particlePreWarmPresets` option (set in project.json#render).
    // No project-local warmup entity needed.

    // S84 KABOOM-TITLE-SCREEN. Before the first round, mount the
    // GamePaused singleton so bot AI / bomb fuse / bomb placement
    // freeze. The title-screen HUD overlay listens for Space to
    // remove the marker + dismiss the overlay.
    //
    // S84 KABOOM-BOT-DIFFICULTY. Apply the URL-selected preset to
    // bot.1 on the same batch so even the very first round honours
    // ?difficulty=easy|normal|hard.
    const initialPreset = readDifficultyFromUrl(
      (globalThis as unknown as { location?: { search?: string } }).location?.search
    );
    const initialPersonality = resolveSessionBotPersonality(
      (globalThis as unknown as { location?: { search?: string } }).location?.search
    );
    const initialTuning = difficultyComponentPatch(initialPreset);
    // S139 — HMR replay re-runs attachUi against a live runtime where
    // these singletons already exist. Use the idempotent upsert helper
    // so the second pass updates the existing entities via
    // component.set instead of throwing on duplicate entity.create.
    // S171 KABOOM-ARENA-THEMES MVP — URL `?theme=` overrides; otherwise
    // default per-arena (warehouse for unknown arenas). The activeMapName
    // was seeded a few lines up from `?map=` so defaultThemeForArena
    // sees the right scene id.
    const initialThemeKey: ArenaThemeKey =
      readArenaThemeFromUrl() ?? defaultThemeForArena(activeMapName);
    // S173 GDP-2026-05-28-010 — promote the source scene's optional
    // top-level `heightmap` field into a Heightmap component on the
    // grid singleton + lift Y of any non-zero-cell entity. Pulled from
    // the registered scene JSON for the active map; on flat arenas this
    // returns no commands so startup pays nothing extra.
    const initialSourceScene = MAP_REGISTRY.get(activeMapName) as SceneInput | undefined;
    const initialHeightmapCommands = initialSourceScene !== undefined
      ? applyHeightmapCommands(initialSourceScene, initialThemeKey)
      : [];
    // S176 KABOOM-FLOOR-WANG-TILES MVP — spawn per-cell floor-overlay
    // entities from the source scene's optional `terrainmap`. Empty
    // for scenes that don't author one.
    const initialTerrainmapCommands = initialSourceScene !== undefined
      ? applyTerrainmapCommands(initialSourceScene)
      : [];

    // S176 fix: when ?map=X selects a non-default scene, prepend a
    // scene.load + replace the upsertEntityCommands path with a fresh
    // entity.create for game-state / round-state singletons. The
    // engine initially loaded start.scene.json (per src/main.ts) +
    // restartScene already wrote kaboom.game-state; my scene.load
    // wipes them, so we must NOT use upsertEntityCommands (which
    // evaluates against the pre-wipe world). Force entity.create.
    const needsSceneLoadOverride = activeMapName !== "start" && initialSourceScene !== undefined;
    // S176 fix: scene.load only iterates entities[] — it does NOT expand
    // instances[]. Pre-expand prefabs so bots / blocks / pickups appear.
    const expandedInitialScene = needsSceneLoadOverride
      ? buildFlatStartScene(activeMapName)
      : undefined;
    const gameStateCmds: EngineCommand[] = needsSceneLoadOverride
      ? [{
          kind: "entity.create",
          entityId: "kaboom.game-state",
          components: {
            GamePaused: { reason: "title-screen" },
            MatchState: { phase: "playing", target: readMatchTargetFromUrl() ?? 3, matchNumber: 1 },
            SuddenDeathConfig: { ...readSuddenDeathFromUrl(), ringIntervalS: 2, ringWidth: 1 },
            ArenaTheme: { themeKey: initialThemeKey }
          }
        }]
      : upsertEntityCommands(runtime.world, "kaboom.game-state", {
          GamePaused: { reason: "title-screen" },
          MatchState: { phase: "playing", target: readMatchTargetFromUrl() ?? 3, matchNumber: 1 },
          SuddenDeathConfig: { ...readSuddenDeathFromUrl(), ringIntervalS: 2, ringWidth: 1 },
          ArenaTheme: { themeKey: initialThemeKey }
        });
    const initialBatch: EngineCommand[] = [
      ...(needsSceneLoadOverride && expandedInitialScene !== undefined
        ? [{ kind: "scene.load" as const, scene: expandedInitialScene }]
        : []),
      ...initialHeightmapCommands,
      ...initialTerrainmapCommands,
      // S84 + S115 — single kaboom.game-state singleton (resolved above
      // via needsSceneLoadOverride: entity.create when a scene.load is
      // about to wipe the world, otherwise upsert against live state).
      ...gameStateCmds,
      // S85 KABOOM-ROUND-TIMER. Seed RoundState up-front. Same
      // entity.create-vs-upsert split as game-state above: when my
      // scene.load wipes the world, the upsert would emit component.set
      // against a since-deleted entity.
      ...(needsSceneLoadOverride
        ? [{
            kind: "entity.create" as const,
            entityId: "kaboom.round-state",
            components: {
              RoundState: {
                phase: "playing",
                elapsed: 0,
                roundNumber: 1,
                tally: { player: 0, bot: 0, draws: 0 },
                timeLimit: readRoundTimeLimit(),
                matchTarget: readMatchTargetFromUrl() ?? 3
              }
            }
          }]
        : upsertEntityCommands(runtime.world, "kaboom.round-state", {
            RoundState: {
              phase: "playing",
              elapsed: 0,
              roundNumber: 1,
              tally: { player: 0, bot: 0, draws: 0 },
              timeLimit: readRoundTimeLimit(),
              matchTarget: readMatchTargetFromUrl() ?? 3
            }
          }))
    ];
    // S163-revert: camera-follow caused persistent 'двоится' artifact
    // ('как будто две камеры со смещением'). Both kaboom-side
    // Transform writes AND engine-side FollowCamera produced it.
    // Reverting all camera changes for this sprint — camera stays at
    // the scene-authored fixed position. Re-attempt as a separate
    // story once the rendering pipeline interaction is debugged.
    if (!_networkedMode) {
      // Static profile only — bot tuning patches for all 3 solo bots
      // (S141). Each carries its own personality slot from
      // MULTI_BOT_ASSIGNMENT so hunter/coward/miner all spawn every
      // round.
      for (const { id, personality: p } of MULTI_BOT_ASSIGNMENT) {
        initialBatch.push(
          { kind: "component.set", entityId: id, component: "BotBrain", data: { ...initialTuning.BotBrain, personality: p } },
          { kind: "component.set", entityId: id, component: "BomberStats", data: initialTuning.BomberStats },
          { kind: "component.set", entityId: id, component: "GridMover", data: initialTuning.GridMover }
        );
      }
    } else {
      // S120 KABOOM-MP-SPRINT-B + S141 — on connected, delete every
      // scene-spawned solo bot. The server owns bot.1; bot.2 + bot.3
      // are solo-only and would otherwise sit idle.
      for (const id of MULTI_BOT_IDS) {
        initialBatch.push({ kind: "entity.delete", entityId: id });
      }
    }
    runtime.applyCommands(initialBatch);
    // S104 KABOOM-MIGRATE-PREFABS: register the procbomber per-part
    // builders + spawn one tree per bomber root. Recipe seeded from
    // the entity id so each bomber looks different. S141 — the
    // renderer's callback walks the static assignment to map each
    // solo bot id to its personality; player.1 always uses the
    // sky palette via makeKaboomRecipe.
    // S156 — pass the unlocked accessory kinds so the player.1 recipe
    // only picks from earned accessories. Bots stay personality-driven.
    const initialUnlockedKinds = _boundProfileStore !== undefined
      ? unlockedAccessoryKinds(_boundProfileStore.get().cosmeticUnlocks)
      : undefined;
    const playerRecipe = makeKaboomRecipe(
      "player.1",
      undefined,
      initialUnlockedKinds !== undefined ? { unlockedAccessoryKinds: initialUnlockedKinds } : {}
    );
    const recipePersonalityById = new Map<string, BotPersonality>(
      _networkedMode ? [] : MULTI_BOT_ASSIGNMENT.map((b) => [b.id, b.personality] as const)
    );
    registerProcbomberBuilders(
      runtime.renderer,
      (ownerId) => {
        if (ownerId === "player.1" && _boundProfileStore !== undefined) {
          const kinds = unlockedAccessoryKinds(_boundProfileStore.get().cosmeticUnlocks);
          return makeKaboomRecipe(ownerId, undefined, { unlockedAccessoryKinds: kinds });
        }
        return makeKaboomRecipe(ownerId, recipePersonalityById.get(ownerId));
      }
    );
    // S165 KABOOM-MULTI-VARIANT-BLOCKS + S170 KABOOM-WANG-INTEGRATION —
    // register hard / soft / floor procedural builders AND the per-
    // variant Wang mesh keys (`kaboom-hard-block-0` ..
    // `kaboom-hard-block-3` etc). block-variant-system stamps WangTile
    // + WangTileFamilyMember; the engine resolver writes the variant
    // index; the kaboom-side mesh-sync bridge writes
    // `procedural:kaboom-hard-block-N` onto MeshRenderer.mesh. The
    // registry needs ALL the keys before the renderer sync ticks.
    registerKaboomBlockBuilders(runtime.renderer);
    // S280 — bomb outline duplicate uses a procedural-mesh ref to
    // bypass the auto-batch path; register its geometry builder
    // alongside the block builders so it's ready before the first
    // bomb spawns.
    registerKaboomBombOutlineBuilder(runtime.renderer);
    // S170 — Wang family registration is idempotent (HMR-safe) so the
    // call is unconditional.
    registerKaboomWangFamilies();
    spawnBomberFor((cmds) => runtime.applyCommands(cmds), "player.1", playerRecipe);
    // S120 — on connected, server owns bot.1; snapshot delivers it +
    // remote-bomber-decorator spawns the procbomber tree locally.
    // S141 — solo spawns all three bot trees.
    if (!_networkedMode) {
      for (const { id, personality: p } of MULTI_BOT_ASSIGNMENT) {
        const botRecipe = makeKaboomRecipe(id, p);
        spawnBomberFor((cmds) => runtime.applyCommands(cmds), id, botRecipe);
      }
    }
    void initialPersonality; // S141 — preserved for future per-bot URL overrides.
    // S117 KABOOM-BOMBER-MATERIAL-PATCH — procbomber meshes paint
    // per-vertex colour (palette + panel seams + decals + stripes),
    // but the engine's default MeshStandardMaterial has
    // vertexColors=false. Without this patch the bombers render with
    // a washed-out base colour and none of the recipe palette shows.
    // The bench bootstrap handles this in its rebuild loop; Kaboom
    // spawns once + needs an explicit poll until every mesh handle
    // exists (MeshLifecycleSystem creates them on the next tick).
    startVertexColorsPoller(runtime);
    // S189 KABOOM-ARENA-SKY-COLOR — sync the scene background to the
    // active theme's skyColor whenever the ArenaTheme component
    // changes (initial load + restart + URL flag flip).
    startArenaSkyApplyPoller(runtime);
    // S190 KABOOM-ARENA-LIGHT-TINT — recolour light.sun + light.ambient
    // from theme.directionalLightTint / ambientHemisphericSky on theme
    // change. Engine light-lifecycle-system propagates the colour to
    // the underlying Three.js light next tick.
    startArenaLightApplyPoller(runtime);
    // S201 KABOOM-ARENA-ATMOSPHERIC — push the per-theme fog colour +
    // density + tonemap exposure to the renderer each theme change.
    // ?fog=off URL flag clears scene fog regardless of theme.
    startArenaAtmosphericApplyPoller(runtime);
    let titleScreenMounted = false;
    let gameStarted = false;
    // S85 KABOOM-CONTROLS-HINT — performance.now() when the round
    // first becomes playable; used to keep the hint widget on screen
    // for 4 s.
    let gameStartedAtMs = 0;
    const startGame = (): void => {
      if (gameStarted) return;
      gameStarted = true;
      gameStartedAtMs = performance.now();
      runtime.applyCommands([
        { kind: "component.remove", entityId: "kaboom.game-state", component: "GamePaused" }
      ]);
    };

    // S85 KABOOM-AUDIO-PROCEDURAL-SFX. Drop the S84 placeholder
    // audio.load URLs (which pointed at non-existing files and fell
    // through silently) and route the four binding events through a
    // procedural WebAudio synth. No binary assets to ship; audio
    // starts working the moment the user clicks the page (the
    // AudioContext is lazily created on the first play() because
    // browsers reject construction before a user gesture).
    // S86 AGF-AUDIO-VOLUME-DIAL. Resolve master volume from ?audio=,
    // falling back to localStorage and then the default. Scale the
    // existing 0.4 baseline by the dial so masterGain stays in the
    // tuned-for-SFX range.
    const audioGlobals = globalThis as unknown as { location?: { search?: string }; localStorage?: typeof localStorage };
    const dial = resolveAudioVolume({
      ...(audioGlobals.location?.search !== undefined ? { search: audioGlobals.location.search } : {}),
      ...(audioGlobals.localStorage !== undefined ? { storage: audioGlobals.localStorage } : {})
    });
    // S167 KABOOM-RECIPE-VOICE — derive each bomber's voice colour from
    // its character recipe (proportions + palette + accessories) instead
    // of the raw entity id. Personality is sourced from MULTI_BOT_ASSIGNMENT
    // when the entity id matches a bot slot.
    const botPersonalityById = new Map<string, "hunter" | "miner" | "coward">(
      MULTI_BOT_ASSIGNMENT.map(({ id, personality }) => [id, personality])
    );
    const voiceResolver = (entityId: string): import("./src/voice-synth").VoiceColour | undefined => {
      try {
        const recipe = makeKaboomRecipe(entityId, botPersonalityById.get(entityId));
        return voiceParamsFromRecipe({
          seed: recipe.seed,
          torsoHeight: recipe.torsoHeight,
          headSize: recipe.headSize,
          paletteName: recipe.paletteName,
          accessoryKinds: (recipe.accessories ?? []).map((a) => a.kind as string),
          ...(botPersonalityById.has(entityId) ? { botPersonality: botPersonalityById.get(entityId) } : {})
        });
      } catch {
        return undefined;
      }
    };
    const audioFx = createKaboomAudioFx({ masterGain: 0.4 * dial, voiceColourResolver: voiceResolver });
    // QA-2026-05-27-001 — restore the muted preference from its OWN
    // localStorage key (`agf.audio.muted`). The previous bug wrote "0"
    // to the volume key on mute, permanently silencing audio on reload
    // even after the user toggled unmute.
    if (audioGlobals.localStorage !== undefined) {
      const persistedMuted = resolveAudioMuted({ storage: audioGlobals.localStorage });
      if (persistedMuted) audioFx.setMuted(true);
    }

    // S153 KABOOM-PLAYER-PROFILE / S156 KABOOM-COSMETIC-UNLOCKS — the
    // store is hoisted to the top of attachUi (so the player.1 recipe
    // can read cosmeticUnlocks before spawn). Alias here for the
    // existing snapshot-loop call sites that already use `profileStore`.
    const profileStore: ProfileStore = _boundProfileStore!;
    _audioLog = [];
    _boundAudioEvent = (kind, c): void => {
      const entry: AudioLogEntry = { kind, ts: Date.now() };
      if (c?.entityId !== undefined) entry.entityId = c.entityId;
      _audioLog.push(entry);
      // Cap the log so a long-running session doesn't grow unbounded.
      if (_audioLog.length > 200) _audioLog.splice(0, _audioLog.length - 200);
      // S91 KABOOM-AUDIO-POSITIONAL-ADOPT — forward the world-space
      // position to audioFx so it routes through a PannerNode. S145
      // hotfix — also forward entityId so the voice-* synth path
      // (audio-fx playVoice) emits the per-bomber seeded utterance.
      // Without entityId the synth early-returned and every voice-*
      // event was silently swallowed. Logic in ./src/audio-event-forward.
      forwardAudioEvent(kind, c, (k, ctx) => audioFx.play(k, ctx));
    };

    // S86 KABOOM-PAUSE-MENU. Mutable presets list for the Difficulty
    // cycle button — reads / writes the URL's `?difficulty=` so a
    // reload preserves it.
    type DiffPreset = "easy" | "normal" | "hard";
    const DIFF_ORDER: DiffPreset[] = ["easy", "normal", "hard"];
    function currentDifficulty(): DiffPreset {
      const search = (globalThis as unknown as { location?: { search?: string } }).location?.search ?? "";
      try {
        const v = new URLSearchParams(search).get("difficulty");
        if (v === "easy" || v === "normal" || v === "hard") return v;
      } catch {}
      return "normal";
    }
    function cycleDifficulty(): DiffPreset {
      const idx = DIFF_ORDER.indexOf(currentDifficulty());
      const next = DIFF_ORDER[(idx + 1) % DIFF_ORDER.length]!;
      const loc = (globalThis as unknown as { location?: { search?: string; pathname?: string }; history?: { replaceState(s: unknown, t: string, u: string): void } });
      if (loc.history !== undefined && loc.location !== undefined) {
        const params = new URLSearchParams(loc.location.search ?? "");
        params.set("difficulty", next);
        loc.history.replaceState(null, "", `${loc.location.pathname ?? ""}?${params.toString()}`);
      }
      const tuning = difficultyComponentPatch(next);
      // S100 KABOOM-BOT-PERSONALITY-VARIANTS — re-read personality on
      // each difficulty cycle so URL changes between cycles are picked
      // up; cycling difficulty doesn't otherwise touch personality.
      const personality = resolveSessionBotPersonality(
        (globalThis as unknown as { location?: { search?: string } }).location?.search
      );
      void personality; // S141 — kept for future per-bot URL overrides.
      if (!_networkedMode) {
        // S141 — apply difficulty to every solo bot. Each bot keeps
        // its own personality slot from MULTI_BOT_ASSIGNMENT.
        runtime.applyCommands(
          MULTI_BOT_ASSIGNMENT.flatMap(({ id, personality: p }) => [
            { kind: "component.set", entityId: id, component: "BotBrain", data: { ...tuning.BotBrain, personality: p } } as EngineCommand,
            { kind: "component.set", entityId: id, component: "BomberStats", data: tuning.BomberStats } as EngineCommand,
            { kind: "component.set", entityId: id, component: "GridMover", data: tuning.GridMover } as EngineCommand
          ])
        );
      }
      return next;
    }

    // S86 KABOOM-PAUSE-MENU. Mounted on Esc, unmounted on Esc again /
    // Resume click. Adds GamePaused while open.
    const PAUSE_MENU_ID = "kaboom.pause-menu";
    let pauseMenuMounted = false;
    function openPauseMenu(): void {
      if (pauseMenuMounted) return;
      pauseMenuMounted = true;
      runtime.applyCommands([
        { kind: "component.set", entityId: "kaboom.game-state", component: "GamePaused", data: { reason: "pause-menu" } }
      ]);
      const hud2 = (runtime as unknown as { hud?: typeof hud }).hud;
      hud2?.add({
        id: PAUSE_MENU_ID,
        slot: "center",
        initial: undefined,
        render: (): HTMLElement => {
          const root = document.createElement("div");
          root.setAttribute("style", "display:flex;flex-direction:column;gap:8px;padding:12px 16px;font-size:16px;min-width:200px;text-align:center;");
          const title = document.createElement("div");
          title.setAttribute("style", "font-size:20px;font-weight:600;margin-bottom:4px;");
          title.textContent = "Paused";
          root.appendChild(title);
          const mkBtn = (label: string, onClick: () => void): HTMLButtonElement => {
            const btn = document.createElement("button");
            btn.textContent = label;
            btn.setAttribute("style", "pointer-events:auto;padding:6px 12px;font-size:14px;cursor:pointer;background:#2a3a5c;color:#fff;border:1px solid #5a6e94;border-radius:4px;");
            btn.addEventListener("click", onClick);
            return btn;
          };
          root.appendChild(mkBtn("Resume", closePauseMenu));
          root.appendChild(mkBtn("Restart", () => { closePauseMenu(); restartScene(runtime); }));
          const diff = currentDifficulty();
          const diffBtn = mkBtn(`Difficulty: ${diff}`, () => {
            const next = cycleDifficulty();
            diffBtn.textContent = `Difficulty: ${next}`;
          });
          root.appendChild(diffBtn);
          // S89 KABOOM-PAUSE-AUDIO-MUTE — toggle audioFx.setMuted +
          // persist to the dedicated muted-state localStorage key.
          // QA-2026-05-27-001 fix: writes to `agf.audio.muted`, NOT
          // `agf.audio.volume`. The volume dial stays under the user's
          // control via `?audio=` + `agf.audio.volume`; the mute toggle
          // is a separate boolean preference.
          const audioBtn = mkBtn(`Audio: ${audioFx.isMuted() ? "OFF" : "ON"}`, () => {
            const next = !audioFx.isMuted();
            audioFx.setMuted(next);
            try {
              const storage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
              storage?.setItem(AUDIO_MUTED_STORAGE_KEY, next ? "1" : "0");
            } catch {
              // ignore quota / disabled storage
            }
            audioBtn.textContent = `Audio: ${next ? "OFF" : "ON"}`;
          });
          root.appendChild(audioBtn);
          return root;
        }
      });
    }
    function closePauseMenu(): void {
      if (!pauseMenuMounted) return;
      pauseMenuMounted = false;
      const hud2 = (runtime as unknown as { hud?: typeof hud }).hud;
      hud2?.remove(PAUSE_MENU_ID);
      runtime.applyCommands([
        { kind: "component.remove", entityId: "kaboom.game-state", component: "GamePaused" }
      ]);
    }

    const handleKey = (event: KeyboardEvent): void => {
      // S86 KABOOM-PAUSE-MENU — Esc toggles the menu (but only after
      // the title screen is dismissed; on the title screen, Esc is
      // ignored so user doesn't double-pause).
      if (event.code === "Escape" && gameStarted) {
        if (pauseMenuMounted) closePauseMenu();
        else openPauseMenu();
        return;
      }
      // S84 KABOOM-TITLE-SCREEN — Space dismisses the title screen on
      // the first press; subsequent Space presses fall through to the
      // bomb-place handler (PlayerInputSystem).
      if (event.code === "Space" && !gameStarted) {
        startGame();
        return;
      }
      if (event.code !== "KeyR") return;
      restartScene(runtime);
    };
    window.addEventListener("keydown", handleKey);

    // S82 KABOOM-AGENT-CONTROLS. Mount an agent-facing control surface
    // on `window.__agf.kaboom` so this assistant + future scripted
    // playtests can drive the game in one curl/call without simulating
    // keyboard events. Four primitives are exposed:
    //   - gotoCell(entityId, gx, gz) — returns a Promise<GotoResult>
    //     that resolves when AgentGotoSystem clears the AgentGoto
    //     component, reporting outcome + final cell. Outcomes:
    //       'arrived'     — reached the target;
    //       'unreachable' — target was blocked at request time;
    //       'stuck'       — couldn't make progress (v0 path policy);
    //       'timeout'     — caller-supplied timeoutMs elapsed.
    //   - placeBomb(entityId) — writes PlaceBombRequest transient (same
    //     pipeline as Space-key + bot AI).
    //   - status() — compact JSON of round + players + bombs + tiles.
    //   - restart() — host-driven scene reload (same as KeyR).
    type GotoResult = {
      reached: boolean;
      outcome: "arrived" | "unreachable" | "stuck" | "timeout";
      finalGx: number;
      finalGz: number;
      targetGx: number;
      targetGz: number;
    };

    type EntitySnapshot = {
      gx: number | undefined;
      gz: number | undefined;
      hasAgentGoto: boolean;
      result: { outcome: "arrived" | "unreachable" | "stuck"; finalGx: number; finalGz: number } | undefined;
    };

    function findEntity(entityId: string): EntitySnapshot | undefined {
      const snap = runtime.snapshot();
      const e = snap.entities.find((x) => x.id === entityId);
      if (e === undefined) return undefined;
      const c = e.components as Record<string, Record<string, unknown> | undefined>;
      const pos = c["GridPosition"] as { gx?: number; gz?: number } | undefined;
      const res = c["AgentGotoResult"] as { outcome?: "arrived" | "unreachable" | "stuck"; finalGx?: number; finalGz?: number } | undefined;
      return {
        gx: pos?.gx,
        gz: pos?.gz,
        hasAgentGoto: c["AgentGoto"] !== undefined,
        result:
          res?.outcome !== undefined && res.finalGx !== undefined && res.finalGz !== undefined
            ? { outcome: res.outcome, finalGx: res.finalGx, finalGz: res.finalGz }
            : undefined
      };
    }

    const api = {
      gotoCell(entityId: string, gx: number, gz: number, options: { timeoutMs?: number; pollMs?: number } = {}): Promise<GotoResult> {
        const timeoutMs = options.timeoutMs ?? 10_000;
        const pollMs = options.pollMs ?? 50;
        // applyCommands is synchronous against the world. AgentGoto is
        // present in the snapshot before the first poll tick fires.
        // Any AgentGotoResult left over from a prior gotoCell is
        // ignored while AgentGoto is on the entity, and gets
        // overwritten by AgentGotoSystem when this attempt finishes.
        runtime.applyCommands([
          { kind: "component.set", entityId, component: "AgentGoto", data: { targetGx: gx, targetGz: gz } }
        ]);
        return new Promise<GotoResult>((resolve) => {
          const startedAt = Date.now();
          const tick = (): void => {
            const e = findEntity(entityId);
            if (e === undefined) {
              resolve({ reached: false, outcome: "stuck", finalGx: gx, finalGz: gz, targetGx: gx, targetGz: gz });
              return;
            }
            if (!e.hasAgentGoto) {
              const finalGx = e.result?.finalGx ?? e.gx ?? gx;
              const finalGz = e.result?.finalGz ?? e.gz ?? gz;
              const outcome = e.result?.outcome ?? (finalGx === gx && finalGz === gz ? "arrived" : "stuck");
              resolve({ reached: outcome === "arrived", outcome, finalGx, finalGz, targetGx: gx, targetGz: gz });
              return;
            }
            if (Date.now() - startedAt > timeoutMs) {
              const finalGx = e.gx ?? gx;
              const finalGz = e.gz ?? gz;
              resolve({ reached: false, outcome: "timeout", finalGx, finalGz, targetGx: gx, targetGz: gz });
              return;
            }
            setTimeout(tick, pollMs);
          };
          setTimeout(tick, pollMs);
        });
      },
      placeBomb(entityId: string): void {
        runtime.applyCommands([
          { kind: "component.set", entityId, component: "PlaceBombRequest", data: {} }
        ]);
      },
      restart(): void {
        restartScene(runtime);
      },
      // S84 KABOOM-AUDIO-WIRE — agent-facing mirror of the audio event
      // stream. Useful for probes that need to verify a sound was
      // triggered without depending on HTMLAudioElement readiness.
      audioLog(): ReadonlyArray<AudioLogEntry> {
        return _audioLog.slice();
      },
      // S83 AGF-MOTION-SMOOTHNESS-PROBE. Returns the entity's
      // current world-space (x, z) from Transform.position — cheap
      // sampling target for per-frame motion-smoothness probes.
      worldXZ(entityId: string): [number, number] | undefined {
        const snap = runtime.snapshot();
        const e = snap.entities.find((x) => x.id === entityId);
        const t = (e?.components as Record<string, Record<string, unknown>> | undefined)?.["Transform"];
        const pos = (t as { position?: ReadonlyArray<number> } | undefined)?.position;
        if (pos === undefined) return undefined;
        return [pos[0] ?? 0, pos[2] ?? 0];
      },
      status(): unknown {
        const snap = runtime.snapshot();
        const round = (snap.entities.find((e) => e.id === "kaboom.round-state")?.components as Record<string, unknown> | undefined)?.["RoundState"];
        // S115 KABOOM-MATCH-STRUCTURE — surface MatchState alongside RoundState.
        const match = (snap.entities.find((e) => e.id === "kaboom.game-state")?.components as Record<string, unknown> | undefined)?.["MatchState"];
        const players = snap.entities
          .filter((e) => (e.components as Record<string, unknown> | undefined)?.["BomberStats"] !== undefined)
          .map((e) => {
            const c = e.components as Record<string, Record<string, unknown>>;
            return {
              id: e.id,
              gx: (c["GridPosition"] as { gx?: number })?.gx,
              gz: (c["GridPosition"] as { gz?: number })?.gz,
              alive: (c["BomberStats"] as { alive?: boolean })?.alive,
              activeBombs: (c["BomberStats"] as { activeBombs?: number })?.activeBombs,
              maxBombs: (c["BomberStats"] as { maxBombs?: number })?.maxBombs,
              range: (c["BomberStats"] as { range?: number })?.range,
              canKick: (c["BomberStats"] as { canKick?: boolean })?.canKick,
              remoteDetonateCharges: (c["BomberStats"] as { remoteDetonateCharges?: number })?.remoteDetonateCharges,
              shield: (c["BomberStats"] as { shield?: boolean })?.shield,
              speed: (c["BomberStats"] as { speed?: number })?.speed,
              pierce: (c["BomberStats"] as { pierce?: boolean })?.pierce,
              canThrow: (c["BomberStats"] as { canThrow?: boolean })?.canThrow,
              bombPass: (c["BomberStats"] as { bombPass?: boolean })?.bombPass,
              dashCooldownRemainingMs: (c["BomberStats"] as { dashCooldownRemainingMs?: number })?.dashCooldownRemainingMs,
              dashing: (c["BomberStats"] as { dashing?: boolean })?.dashing,
              targetGx: (c["AgentGoto"] as { targetGx?: number })?.targetGx,
              targetGz: (c["AgentGoto"] as { targetGz?: number })?.targetGz,
              // S265 — surface the active bluff on the player record so
              // the HUD can paint a per-bot tag without re-walking
              // the world. Always-on `done` writes are dropped here
              // (treated as no-bluff) so the tag only shows during
              // visible phases.
              bluff: ((): { kind: string; phase: string } | undefined => {
                const bs = c["BotBluffState"] as { kind?: string; phase?: string } | undefined;
                if (bs === undefined) return undefined;
                if (bs.phase === undefined || bs.phase === "done") return undefined;
                if (bs.kind === undefined) return undefined;
                return { kind: bs.kind, phase: bs.phase };
              })(),
              // S266 — situational personality shift label driven by
              // the round-tally bias. Undefined at baseline (±1 win
              // diff). The bot-ai-system already feeds the same diff
              // into its aggression weight via personalityTallyBias;
              // the HUD reads the label so the player can correlate
              // a bot's vibe with its in-flight numbers.
              shiftedLabel: ((): string | undefined => {
                const brain = c["BotBrain"] as { personality?: "hunter" | "coward" | "miner" } | undefined;
                const persona = brain?.personality;
                if (persona === undefined) return undefined;
                const tally = (round as { tally?: { player?: number; bot?: number } } | undefined)?.tally;
                const playerWins = tally?.player ?? 0;
                const botWins = tally?.bot ?? 0;
                return shiftedPersonalityLabel(persona, botWins - playerWins);
              })()
            };
          });
        const bombs = snap.entities
          .filter((e) => (e.components as Record<string, unknown> | undefined)?.["Bomb"] !== undefined)
          .map((e) => {
            const c = e.components as Record<string, Record<string, unknown>>;
            return {
              id: e.id,
              gx: (c["GridPosition"] as { gx?: number })?.gx,
              gz: (c["GridPosition"] as { gz?: number })?.gz,
              fuse: (c["Bomb"] as { fuseRemaining?: number })?.fuseRemaining,
              range: (c["Bomb"] as { range?: number })?.range,
              owner: (c["Bomb"] as { ownerId?: string })?.ownerId
            };
          });
        const tiles = snap.entities
          .filter((e) => (e.components as Record<string, unknown> | undefined)?.["BlastTile"] !== undefined).length;
        const pickups = snap.entities
          .filter((e) => (e.components as Record<string, unknown> | undefined)?.["Pickup"] !== undefined)
          .map((e) => {
            const c = e.components as Record<string, Record<string, unknown>>;
            return {
              id: e.id,
              gx: (c["GridPosition"] as { gx?: number })?.gx,
              gz: (c["GridPosition"] as { gz?: number })?.gz,
              kind: (c["Pickup"] as { kind?: string })?.kind
            };
          });
        // S114 KABOOM-MP-HUD-PEER-COUNT — count server-owned remote
        // bombers. Decorator stamps RemoteBomberOwned on those roots.
        const remotePeers = snap.entities.filter((e) => {
          const c = e.components as Record<string, unknown> | undefined;
          return c?.["RemoteBomberOwned"] !== undefined;
        }).length;
        return { round, match, players, bombs, tiles, pickups, remotePeers };
      },
      // S87 KABOOM-HUD-KEY-GLYPHS. Read-only view of the player input
      // system's pressed-key set. Returns a fresh ReadonlyArray<string>
      // (KeyboardEvent.code values) so callers can render glyphs or
      // diagnose stuck-key bugs without mutating internal state.
      input(): ReadonlyArray<string> {
        if (_boundPlayerInput === undefined) return [];
        return Array.from(_boundPlayerInput.pressedSnapshot());
      },
      // S89 KABOOM-AGENT-MAP-LIST. Programmatic map swap for scripted
      // playtests. `maps()` lists everything in the static registry;
      // `loadMap(name)` flips activeMapName + restarts. Returns true
      // on success, false when the name is unknown.
      maps(): ReadonlyArray<string> {
        return [...MAP_REGISTRY.keys()];
      },
      loadMap(name: string): boolean {
        if (!MAP_REGISTRY.has(name)) return false;
        activeMapName = name as MapName;
        restartScene(runtime);
        return true;
      },
      activeMap(): string {
        return activeMapName;
      },
      // S148 — diagnostic helper: fire a single voice utterance on demand
      // from DevTools (`__agf.kaboom.testVoice("pickup", "player.1")`).
      // Useful for debugging the voice synth without running through the
      // game loop. Each call goes through the same audioFx.play path as
      // real events, including the AudioContext resume gate.
      testVoice(slot: "place-bomb" | "hit" | "pickup" | "death" | "victory", entityId: string = "player.1"): boolean {
        const kind: AudioEventKind =
          slot === "place-bomb" ? "voice-place-bomb" :
          slot === "hit" ? "voice-hit" :
          slot === "pickup" ? "voice-pickup" :
          slot === "death" ? "voice-death" :
          "voice-victory";
        audioFx.play(kind, { entityId });
        return !audioFx.isMuted();
      },
      // S161 KABOOM-HUD-TOOLTIPS — probe surface for automated UI
      // tests: ask the registry what a given icon's tooltip would say
      // without spinning up DOM hover events.
      tooltipFor(iconKey: string, slot?: PowerUpSlotState): unknown {
        // Accept any PowerupIconKind string; registry returns text for
        // unknown keys as undefined fields, so callers can detect
        // unwired icons.
        try {
          return tooltipForPowerUp(iconKey as PowerupIconKind, slot);
        } catch {
          return undefined;
        }
      },
      // S153 — agent probes for the persistent player profile.
      // getProfile() returns the live in-memory profile (mutating the
      // result is safe — fields are copied per get()). setProfileStats
      // is for QA / screenshot fixtures that want a specific stat
      // baseline. resetProfile clears localStorage + drops the
      // in-memory state so the next read creates a fresh profile.
      getProfile(): unknown {
        return profileStore.get();
      },
      setProfileStats(partial: Record<string, unknown>): void {
        profileStore.setStats(partial as Parameters<typeof profileStore.setStats>[0]);
        profileStore.flush();
      },
      resetProfile(): void {
        profileStore.reset();
      },
      // S156 KABOOM-COSMETIC-UNLOCKS — agent probes for the unlock
      // system. getUnlocks returns the live earned ids + the unlock
      // catalogue (id → label / accessory / threshold) for tests.
      // forceUnlock + resetUnlocks are test-only.
      getUnlocks(): unknown {
        const p = profileStore.get();
        return {
          earned: [...p.cosmeticUnlocks],
          catalog: UNLOCK_DEFS.map((d) => ({
            id: d.id,
            accessory: d.accessory,
            label: d.label,
            description: d.description,
            progress: d.progress(p.lifetimeStats),
            unlocked: p.cosmeticUnlocks.includes(d.id)
          }))
        };
      },
      forceUnlock(id: string): boolean {
        const def = findUnlock(id);
        if (def === undefined) return false;
        const live = profileStore.get();
        if (live.cosmeticUnlocks.includes(id)) return true;
        profileStore.setUnlocks([...live.cosmeticUnlocks, id]);
        profileStore.flush();
        return true;
      },
      resetUnlocks(): void {
        profileStore.removeUnlock();
        profileStore.flush();
      }
    };

    interface KaboomGlobal {
      __agf?: { kaboom?: typeof api } & Record<string, unknown>;
    }
    const w = window as unknown as KaboomGlobal;
    // src/main.ts assigns `window.__agf = { ... }` AFTER attachUi runs
    // and the assignment OVERWRITES the global (it's a fresh object
    // literal, not a mutation). The exact timing varies — async asset
    // loads + dev-bridge connection push the assignment well past any
    // single setTimeout we'd pick. Poll for up to 3 s after attachUi
    // and re-inject `kaboom` whenever it's missing. Cheap (only fires
    // until __agf is populated + kaboom is set + survives one frame).
    let polls = 0;
    const pollMount = (): void => {
      polls += 1;
      if (w.__agf === undefined) w.__agf = {};
      if (w.__agf.kaboom !== api) w.__agf.kaboom = api;
      if (polls < 30) setTimeout(pollMount, 100);
    };
    setTimeout(pollMount, 0);
    // Also expose on the runtime handle for non-DOM consumers. The
    // runtime type widens via a structural cast — we don't add an
    // engine-level type for the project-local surface.
    (runtime as unknown as { kaboom?: typeof api }).kaboom = api;

    // S82 KABOOM-HUD-PANEL. Three widgets driven from the ECS each
    // animation frame — engine-side HUD primitives stay generic, the
    // project pushes data:
    //   - topLeft   "kaboom.stats" — player/bot stats line
    //   - topRight  "kaboom.minimap" — Canvas2D minimap
    //   - center    "kaboom.banner" — win/loss/draw banner + restart hint
    // The HUD handle on RuntimeHandle is loosely typed (different
    // runtimes may not surface a HUD); guard with `?.add`.
    type HudCapable = { hud?: { add(spec: unknown): void; update(id: string, data: unknown): void; remove(id: string): void } };
    const hud = (runtime as unknown as HudCapable).hud;
    let rafId: number | undefined;
    let hudCleanup: (() => void) | undefined;
    let tooltipOverlay: IconTooltipOverlayHandle | undefined;
    if (hud !== undefined && typeof globalThis.requestAnimationFrame === "function") {
      // S161 KABOOM-HUD-TOOLTIPS — single shared tooltip overlay used by
      // power-up grid + opponent badges. URL flags ?hudTooltips=off /
      // ?hudTooltipsDelay=N tune behaviour for tests + accessibility.
      const tooltipParams = (() => {
        const search = (globalThis as unknown as { location?: { search?: string } }).location?.search ?? "";
        try {
          const p = new URLSearchParams(search);
          const disabled = p.get("hudTooltips") === "off";
          const delayRaw = p.get("hudTooltipsDelay");
          const delayParsed = delayRaw === null ? Number.NaN : Number(delayRaw);
          const delay = Number.isFinite(delayParsed) && delayParsed >= 0 ? delayParsed : 400;
          return { enabled: !disabled, delayMs: delay };
        } catch {
          return { enabled: true, delayMs: 400 };
        }
      })();
      tooltipOverlay = installIconTooltipOverlay(tooltipParams);
      const STATS_ID = "kaboom.stats";
      const BANNER_ID = "kaboom.banner";
      const MINIMAP_ID = "kaboom.minimap";

      // Layout: src/main.ts puts the project-info shell in the
      // top-left and the perf counter in the top-right. Put kaboom
      // HUD widgets in the bottom corners so neither shell elements
      // nor the canvas viewport overlap them.
      hud.add({
        id: STATS_ID,
        slot: "bottomLeft",
        initial: { lines: ["Kaboom Crew"], timeFrac: 0, timeColor: "#5fa8ff" },
        // Build a node so per-line `<div>`s render as actual line
        // breaks (HUD's string path uses textContent, which collapses
        // \n into a single line under the default white-space rules).
        // S89 KABOOM-ROUND-TIMER-BAR — top of the widget shows a
        // 4 px progress bar that fills as the round timer drains.
        // `timeFrac` 0..1 (0 hides the bar); `timeColor` shifts hue
        // for the last-15 s / last-5 s urgency tiers.
        render: (data: { lines: ReadonlyArray<string>; timeFrac?: number; timeColor?: string }): HTMLElement => {
          const el = document.createElement("div");
          el.setAttribute("style", "display:flex;flex-direction:column;gap:2px;");
          const frac = data.timeFrac ?? 0;
          if (frac > 0) {
            const trough = document.createElement("div");
            trough.setAttribute("style", "height:4px;width:160px;background:rgba(0,0,0,0.45);border-radius:2px;margin-bottom:4px;");
            const fill = document.createElement("div");
            const color = data.timeColor ?? "#5fa8ff";
            fill.setAttribute("style", `height:100%;width:${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%;background:${color};border-radius:2px;`);
            trough.appendChild(fill);
            el.appendChild(trough);
          }
          for (const line of data.lines) {
            const row = document.createElement("div");
            row.textContent = line;
            el.appendChild(row);
          }
          return el;
        }
      });
      // S84 KABOOM-TITLE-SCREEN. Title overlay piggy-backs on the
      // banner spec — same slot, different copy. We add it
      // immediately on attachUi (before bannerMounted toggling
      // begins) and remove it the first time gameStarted flips true.
      const TITLE_ID = "kaboom.title";
      type TitleData = { text: string; opacity?: number };
      hud.add({
        id: TITLE_ID,
        slot: "center" as const,
        initial: { text: "Kaboom Crew\nPress SPACE to start", opacity: 1 } as TitleData,
        render: (data: TitleData): HTMLElement => {
          const el = document.createElement("div");
          const op = data.opacity ?? 1;
          el.setAttribute("style", `font-size:24px;font-weight:600;text-align:center;padding:6px 12px;white-space:pre-line;opacity:${op.toFixed(3)};`);
          el.textContent = data.text;
          return el;
        }
      });
      titleScreenMounted = true;

      // S85 KABOOM-CONTROLS-HINT spec — mounted in the center slot
      // for the first 4 s of the first round, dismissed once the
      // banner needs the slot or the 4 s window expires.
      const CONTROLS_HINT_ID = "kaboom.controls-hint";
      // S097 KABOOM-CONTROLS-HINT-FADE — render reads an `opacity`
      // field so the fade-out loop (later in update()) can modulate
      // it. Default 0.85 (the pre-S097 baseline).
      const controlsHintSpec = {
        id: CONTROLS_HINT_ID,
        slot: "center" as const,
        initial: { opacity: 0.85 } as { opacity: number },
        render: (data: { opacity?: number } = { opacity: 0.85 }): HTMLElement => {
          const el = document.createElement("div");
          const op = data.opacity ?? 0.85;
          el.setAttribute("style", `font-size:14px;font-weight:500;text-align:center;padding:4px 10px;opacity:${op.toFixed(3)};`);
          el.textContent = "WASD / arrows  ·  Space = bomb  ·  R = restart";
          return el;
        }
      };
      let controlsHintMounted = false;
      // S097 KABOOM-CONTROLS-HINT-FADE — track the start of the fade
      // so the update loop can compute opacity each frame.
      const CONTROLS_HINT_FADE_MS = 350;
      let controlsHintFadeStartMs: number | undefined;

      // Banner widget is added on demand because the engine's HUD
      // WIDGET_STYLE always paints a dark pill around the slot — even
      // an empty render leaves a visible dot in the centre of the
      // viewport while the round is playing.
      const bannerSpec = {
        id: BANNER_ID,
        slot: "center" as const,
        initial: { text: "" },
        render: (data: { text: string }): HTMLElement => {
          const el = document.createElement("div");
          el.setAttribute("style", "font-size:18px;font-weight:600;padding:2px 6px;");
          el.textContent = data.text;
          return el;
        }
      };
      // Arena bounds are 15 × 11 cells with cellSize 1, origin at (0,0).
      // Mirror the engine grid layout — same convention the world uses.
      // Pass `initial` so HUD's first render call doesn't dereference
      // an undefined `data.markers` (minimap.paint expects MinimapData).
      const minimapSpec = createMinimapWidget({
        id: MINIMAP_ID,
        slot: "bottomRight",
        bounds: { minX: -0.5, maxX: 14.5, minZ: -0.5, maxZ: 10.5 },
        pixelSize: 160
      });
      hud.add({ ...minimapSpec, initial: { markers: [] } } as unknown);

      // S87 KABOOM-HUD-KEY-GLYPHS. Bottom-left key-glyph row showing
      // which movement keys + Space are currently held. Helps the
      // player spot stuck-key issues and confirms the renderer sees
      // the same input the system sees.
      const KEYS_ID = "kaboom.input";
      const keyOrder: Array<{ code: string; label: string }> = [
        { code: "KeyW", label: "W" },
        { code: "KeyA", label: "A" },
        { code: "KeyS", label: "S" },
        { code: "KeyD", label: "D" },
        { code: "Space", label: "␣" }
      ];
      hud.add({
        id: KEYS_ID,
        slot: "bottomLeft",
        initial: { pressed: [] as ReadonlyArray<string> },
        render: (data: { pressed: ReadonlyArray<string> }): HTMLElement => {
          const el = document.createElement("div");
          el.setAttribute("style", "display:flex;gap:4px;padding-top:6px;");
          const held = new Set(data.pressed);
          // Arrow keys are equivalent to WASD for the same direction —
          // light up the WASD glyph either way to avoid duplicating
          // entries.
          if (held.has("ArrowUp")) held.add("KeyW");
          if (held.has("ArrowLeft")) held.add("KeyA");
          if (held.has("ArrowDown")) held.add("KeyS");
          if (held.has("ArrowRight")) held.add("KeyD");
          for (const k of keyOrder) {
            const on = held.has(k.code);
            const glyph = document.createElement("div");
            const bg = on ? "#5fa8ff" : "rgba(0,0,0,0.4)";
            const fg = on ? "#0a0a0a" : "#cccccc";
            glyph.setAttribute(
              "style",
              `width:20px;height:20px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;background:${bg};color:${fg};`
            );
            glyph.textContent = k.label;
            el.appendChild(glyph);
          }
          return el;
        }
      });

      // S148 KABOOM-POWERUP-HUD — bottom-left icon grid. Replaces the
      // text-flag suffix the stats line carried since S109. Row 1 is
      // the three numeric stats (bomb / fire / speed) with a current
      // value next to the icon. Row 2 is the binary unlocks (kick /
      // remote / shield / pierce / throw-glove); active state renders
      // full-colour with a thin cream outline, inactive renders
      // desaturated at 30 % opacity. Per visual-style.md §1 + §8.3.
      const POWERUP_GRID_ID = "kaboom.powerup-grid";
      type PowerupGridData = {
        bombs: { current: number; max: number };
        fire: number;
        speed: number;
        canKick: boolean;
        remote: boolean;
        shield: boolean;
        pierce: boolean;
        canThrow: boolean;
        bombPass: boolean;
        // S159 KABOOM-DASH — dash is always available (no pickup);
        // dashCooldownFraction is 0..1 where 0 = ready, 1 = just fired.
        dashCooldownFraction: number;
        accent: string;
      };
      const buildIconCell = (
        kind: PowerupIconKind,
        active: boolean,
        label: string | undefined,
        accent: string,
        slot?: PowerUpSlotState
      ): HTMLElement => {
        const wrap = document.createElement("div");
        const opacity = active ? "1" : "0.32";
        const outline = active ? `box-shadow:inset 0 0 0 1px ${accent};` : "";
        wrap.setAttribute(
          "style",
          `display:flex;flex-direction:column;align-items:center;gap:1px;width:30px;height:36px;padding:2px;opacity:${opacity};${outline}background:rgba(0,0,0,0.32);`
        );
        const svgWrap = document.createElement("div");
        svgWrap.setAttribute(
          "style",
          `width:24px;height:24px;display:flex;align-items:center;justify-content:center;filter:${active ? "none" : "grayscale(1)"};`
        );
        svgWrap.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg" aria-label="${kind}">${powerupIconSvgInner(kind)}</svg>`;
        wrap.appendChild(svgWrap);
        if (label !== undefined) {
          const txt = document.createElement("div");
          txt.setAttribute("style", "font-size:9px;font-weight:600;color:#f4e9d3;line-height:1;");
          txt.textContent = label;
          wrap.appendChild(txt);
        }
        // S161 KABOOM-HUD-TOOLTIPS — stamp tooltip attributes so the
        // shared overlay can read them on hover.
        const t = tooltipForPowerUp(kind, slot);
        wrap.setAttribute(TOOLTIP_ATTRS.NAME, t.name);
        wrap.setAttribute(TOOLTIP_ATTRS.DESC, t.description);
        if (t.state !== undefined) wrap.setAttribute(TOOLTIP_ATTRS.STATE, t.state);
        wrap.setAttribute("tabindex", "0");
        return wrap;
      };
      // S159 KABOOM-DASH — dash cell with cooldown ring overlay. The
      // dash icon stays cream when ready; when cooling down a clockwise
      // dark wedge sweeps to mask the icon from full-mask to none.
      const buildDashCell = (cooldownFraction: number, accent: string): HTMLElement => {
        const fraction = Math.max(0, Math.min(1, cooldownFraction));
        const ready = fraction <= 0;
        const wrap = document.createElement("div");
        const outline = ready ? `box-shadow:inset 0 0 0 1px ${accent};` : "";
        wrap.setAttribute(
          "style",
          `position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;width:30px;height:36px;padding:2px;opacity:${ready ? "1" : "0.55"};${outline}background:rgba(0,0,0,0.32);`
        );
        const svgWrap = document.createElement("div");
        svgWrap.setAttribute(
          "style",
          `position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;filter:${ready ? "none" : "grayscale(1)"};`
        );
        svgWrap.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg" aria-label="dash">${powerupIconSvgInner("dash")}</svg>`;
        if (!ready) {
          // Sweep: conic-gradient acts as a clockwise mask. Reads as a
          // shrinking pie slice that empties as cooldown approaches 0.
          const sweepDeg = Math.round(fraction * 360);
          const sweep = document.createElement("div");
          sweep.setAttribute(
            "style",
            `position:absolute;inset:0;background:conic-gradient(rgba(0,0,0,0.78) ${sweepDeg}deg, transparent ${sweepDeg}deg);pointer-events:none;`
          );
          svgWrap.appendChild(sweep);
        }
        wrap.appendChild(svgWrap);
        const label = document.createElement("div");
        label.setAttribute("style", "font-size:9px;font-weight:600;color:#f4e9d3;line-height:1;");
        label.textContent = ready ? "SHIFT" : "...";
        wrap.appendChild(label);
        // S161 — dash tooltip stamps.
        const cooldownMs = Math.round(fraction * 3000);
        const t = tooltipForPowerUp("dash", { kind: "cooldown", readyLabel: "READY", cooldownMs });
        wrap.setAttribute(TOOLTIP_ATTRS.NAME, t.name);
        wrap.setAttribute(TOOLTIP_ATTRS.DESC, t.description);
        if (t.state !== undefined) wrap.setAttribute(TOOLTIP_ATTRS.STATE, t.state);
        wrap.setAttribute("tabindex", "0");
        return wrap;
      };
      hud.add({
        id: POWERUP_GRID_ID,
        slot: "bottomLeft",
        initial: {
          bombs: { current: 0, max: 1 },
          fire: 2,
          speed: 0,
          canKick: false,
          remote: false,
          shield: false,
          pierce: false,
          canThrow: false,
          bombPass: false,
          dashCooldownFraction: 0,
          accent: "#5fa8ff"
        } as PowerupGridData,
        render: (data: PowerupGridData): HTMLElement => {
          const el = document.createElement("div");
          el.setAttribute(
            "style",
            "display:flex;flex-direction:column;gap:3px;padding-top:4px;"
          );
          const row1 = document.createElement("div");
          row1.setAttribute("style", "display:flex;gap:3px;");
          row1.appendChild(buildIconCell("bomb", true, `${data.bombs.current}/${data.bombs.max}`, data.accent,
            { kind: "counter", current: data.bombs.current, max: data.bombs.max }));
          row1.appendChild(buildIconCell("fire", true, String(data.fire), data.accent,
            { kind: "counter", current: data.fire, max: data.fire }));
          // Speed shows the *bonus level* (0+); 0 reads as "baseline" so
          // we still light the icon at the baseline state.
          row1.appendChild(buildIconCell("speed", true, `+${data.speed}`, data.accent,
            { kind: "level", level: data.speed, baseline: "baseline" }));
          el.appendChild(row1);
          const row2 = document.createElement("div");
          row2.setAttribute("style", "display:flex;gap:3px;");
          row2.appendChild(buildIconCell("kick", data.canKick, undefined, data.accent, { kind: "flag", active: data.canKick }));
          row2.appendChild(buildIconCell("remote", data.remote, undefined, data.accent, { kind: "flag", active: data.remote }));
          row2.appendChild(buildIconCell("shield", data.shield, undefined, data.accent, { kind: "flag", active: data.shield }));
          row2.appendChild(buildIconCell("pierce", data.pierce, undefined, data.accent, { kind: "flag", active: data.pierce }));
          row2.appendChild(buildIconCell("throw-glove", data.canThrow, undefined, data.accent, { kind: "flag", active: data.canThrow }));
          row2.appendChild(buildIconCell("bomb-pass", data.bombPass, undefined, data.accent, { kind: "flag", active: data.bombPass }));
          // S159 KABOOM-DASH — dash always-available, cooldown shown via overlay.
          row2.appendChild(buildDashCell(data.dashCooldownFraction, data.accent));
          el.appendChild(row2);
          return el;
        }
      });

      // S150 KABOOM-OPPONENT-BADGES — HUD-side approximation of Layer 3
      // from GDP-2026-05-27-005. World-space billboards deferred to a
      // follow-up (no engine billboard primitive yet). Per non-self
      // ALIVE bomber with at least one discrete active state, render
      // a row: [palette swatch] [bomber id] [active-state icons]. Hide
      // rows where no discrete state is active (preserves the "is the
      // bot a threat right now" telegraph; quiet HUD otherwise).
      const OPPONENT_BADGES_ID = "kaboom.opponent-badges";
      type OpponentBadgeRow = {
        id: string;
        icons: ReadonlyArray<PowerupIconKind>;
        accent: string;
      };
      type OpponentBadgesData = { rows: ReadonlyArray<OpponentBadgeRow> };
      hud.add({
        id: OPPONENT_BADGES_ID,
        slot: "bottomLeft",
        initial: { rows: [] } as OpponentBadgesData,
        render: (data: OpponentBadgesData): HTMLElement => {
          const el = document.createElement("div");
          el.setAttribute(
            "style",
            "display:flex;flex-direction:column;gap:2px;padding-top:6px;"
          );
          for (const row of data.rows) {
            const rowEl = document.createElement("div");
            rowEl.setAttribute(
              "style",
              "display:flex;align-items:center;gap:4px;font-size:10px;color:#f4e9d3;"
            );
            const swatch = document.createElement("div");
            swatch.setAttribute(
              "style",
              `width:8px;height:8px;background:${row.accent};border:1px solid #0a0a0a;flex-shrink:0;`
            );
            rowEl.appendChild(swatch);
            const idEl = document.createElement("div");
            idEl.setAttribute("style", "font-weight:600;min-width:42px;");
            idEl.textContent = row.id;
            rowEl.appendChild(idEl);
            for (const icon of row.icons) {
              const wrap = document.createElement("div");
              wrap.setAttribute(
                "style",
                "width:16px;height:16px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);"
              );
              wrap.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg" aria-label="${icon}">${powerupIconSvgInner(icon)}</svg>`;
              // S161 — opponent badge tooltip.
              const t = tooltipForOpponentBadge(icon, row.id);
              wrap.setAttribute(TOOLTIP_ATTRS.NAME, t.name);
              wrap.setAttribute(TOOLTIP_ATTRS.DESC, t.description);
              if (t.state !== undefined) wrap.setAttribute(TOOLTIP_ATTRS.STATE, t.state);
              wrap.setAttribute("tabindex", "0");
              rowEl.appendChild(wrap);
            }
            el.appendChild(rowEl);
          }
          return el;
        }
      });

      // S155 KABOOM-LIFETIME-HUD — opt-in lifetime stats line at the
      // bottom of the bottom-left panel. URL: `?showLifetime=true`.
      // Reads from the S153 profile store; updates each frame so
      // counters tick in real time as the user plays.
      const showLifetime = (() => {
        const search = (globalThis as unknown as { location?: { search?: string } }).location?.search ?? "";
        try {
          return new URLSearchParams(search).get("showLifetime") === "true";
        } catch {
          return false;
        }
      })();
      const LIFETIME_HUD_ID = "kaboom.lifetime-hud";
      type LifetimeHudData = {
        matchesPlayed: number;
        matchesWon: number;
        roundsPlayed: number;
        roundsWon: number;
        roundsDraw: number;
        roundsLost: number;
        deathsByOwnBomb: number;
        maxChainLength: number;
      };
      if (showLifetime) {
        hud.add({
          id: LIFETIME_HUD_ID,
          slot: "bottomLeft",
          initial: {
            matchesPlayed: 0,
            matchesWon: 0,
            roundsPlayed: 0,
            roundsWon: 0,
            roundsDraw: 0,
            roundsLost: 0,
            deathsByOwnBomb: 0,
            maxChainLength: 0
          } as LifetimeHudData,
          render: (data: LifetimeHudData): HTMLElement => {
            const el = document.createElement("div");
            el.setAttribute(
              "style",
              "display:flex;flex-direction:column;gap:2px;padding-top:6px;font-size:10px;color:#f4e9d3;opacity:0.85;"
            );
            const header = document.createElement("div");
            header.setAttribute("style", "font-weight:600;letter-spacing:1px;");
            header.textContent = "LIFETIME";
            el.appendChild(header);
            const lineA = document.createElement("div");
            lineA.textContent = `matches: ${data.matchesWon}/${data.matchesPlayed}`;
            el.appendChild(lineA);
            const lineB = document.createElement("div");
            lineB.textContent = `rounds: W:${data.roundsWon} L:${data.roundsLost} D:${data.roundsDraw} (${data.roundsPlayed})`;
            el.appendChild(lineB);
            const lineC = document.createElement("div");
            lineC.textContent = `self-kills: ${data.deathsByOwnBomb}   max-chain: ${data.maxChainLength}`;
            el.appendChild(lineC);
            return el;
          }
        });
      }

      // S156 KABOOM-COSMETIC-UNLOCKS — centre-bottom banner that
      // celebrates a newly-earned unlock. Mounted on demand (newly-
      // unlocked event); 2.5s lifecycle (fade-in 0.2s + hold 2.0s +
      // fade-out 0.3s). Replacement: rapid threshold crossings queue
      // — current banner finishes its fade-out, next one mounts.
      const UNLOCK_BANNER_ID = "kaboom.unlock-banner";
      type UnlockBannerData = {
        unlockId: string;
        opacity: number;
      };
      const unlockBannerSpec = {
        id: UNLOCK_BANNER_ID,
        slot: "center" as const,
        initial: { unlockId: "first-win", opacity: 0 } as UnlockBannerData,
        render: (data: UnlockBannerData): HTMLElement => {
          const el = document.createElement("div");
          const def = findUnlock(data.unlockId);
          el.setAttribute(
            "style",
            `display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 22px;background:rgba(20,16,8,0.65);border:2px solid #f0b94a;opacity:${data.opacity.toFixed(3)};`
          );
          const accessoryKind = def?.accessory ?? "cap";
          const iconKey = accessoryKind === "cap" ? "kick" : accessoryKind === "fins" ? "speed" : accessoryKind === "antennae" ? "remote" : accessoryKind === "visor" ? "shield" : "pierce";
          const svgWrap = document.createElement("div");
          svgWrap.innerHTML = `<svg viewBox="0 0 24 24" width="72" height="72" xmlns="http://www.w3.org/2000/svg" aria-label="${accessoryKind}">${powerupIconSvgInner(iconKey as PowerupIconKind)}</svg>`;
          el.appendChild(svgWrap);
          const header = document.createElement("div");
          header.setAttribute("style", "font-size:20px;font-weight:700;color:#f0b94a;letter-spacing:1.5px;");
          header.textContent = `UNLOCKED: ${def?.label.toUpperCase() ?? data.unlockId.toUpperCase()}`;
          el.appendChild(header);
          if (def !== undefined) {
            const sub = document.createElement("div");
            sub.setAttribute("style", "font-size:13px;color:#f4e9d3;opacity:0.85;");
            sub.textContent = def.description;
            el.appendChild(sub);
            const acc = document.createElement("div");
            acc.setAttribute("style", "font-size:11px;color:#f4e9d3;opacity:0.65;letter-spacing:1px;");
            acc.textContent = `accessory: ${def.accessory}`;
            el.appendChild(acc);
          }
          return el;
        }
      };
      let unlockBannerMounted = false;
      let unlockBannerStartMs: number | undefined;
      let unlockBannerCurrentId: string | undefined;
      const unlockBannerQueue: UnlockId[] = [];
      const UNLOCK_BANNER_FADE_IN_MS = 200;
      const UNLOCK_BANNER_HOLD_MS = 2000;
      const UNLOCK_BANNER_FADE_OUT_MS = 300;
      const enqueueUnlockBanners = (ids: ReadonlyArray<UnlockId>): void => {
        for (const id of ids) unlockBannerQueue.push(id);
      };
      const promoteNextUnlockBanner = (): void => {
        const next = unlockBannerQueue.shift();
        if (next === undefined) return;
        if (!unlockBannerMounted) {
          hud.add(unlockBannerSpec);
          unlockBannerMounted = true;
        }
        unlockBannerCurrentId = next;
        unlockBannerStartMs = performance.now();
        hud.update(UNLOCK_BANNER_ID, { unlockId: next, opacity: 0 });
      };

      // S148 KABOOM-POWERUP-TOOLTIP — transient centre-screen banner that
      // tells the player WHAT they just picked up. One active tooltip at
      // a time; replacement on rapid chains uses the same widget id so
      // the existing instance just receives updated data.
      const PICKUP_TOOLTIP_ID = "kaboom.pickup-tooltip";
      type PickupTooltipData = {
        kind: string;
        opacity: number;
        accent: string;
      };
      const pickupTooltipSpec = {
        id: PICKUP_TOOLTIP_ID,
        slot: "center" as const,
        initial: { kind: "bomb-up", opacity: 0, accent: "#5fa8ff" } as PickupTooltipData,
        render: (data: PickupTooltipData): HTMLElement => {
          const el = document.createElement("div");
          const icon = PICKUP_ICON[data.kind];
          const label = PICKUP_TOOLTIP_LABEL[data.kind] ?? data.kind.toUpperCase();
          el.setAttribute(
            "style",
            `display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 18px;background:rgba(0,0,0,0.55);border:1.5px solid ${data.accent};opacity:${data.opacity.toFixed(3)};`
          );
          if (icon !== undefined) {
            const svgWrap = document.createElement("div");
            svgWrap.innerHTML = `<svg viewBox="0 0 24 24" width="64" height="64" xmlns="http://www.w3.org/2000/svg" aria-label="${icon}">${powerupIconSvgInner(icon)}</svg>`;
            el.appendChild(svgWrap);
          }
          const labelEl = document.createElement("div");
          labelEl.setAttribute("style", "font-size:18px;font-weight:700;color:#f4e9d3;letter-spacing:1px;");
          labelEl.textContent = label;
          el.appendChild(labelEl);
          return el;
        }
      };
      let pickupTooltipMounted = false;
      let pickupTooltipKind: string | undefined;
      let pickupTooltipStartMs: number | undefined;
      // Diff source for local pickup-collect detection. Re-bound each
      // frame from the snapshot's pickup list.
      let prevPickupCells = new Map<string, string>();
      // S153 — prior-frame round + match phase, used to detect
      // resolved-transitions and bump profile stats exactly once per
      // outcome. The first frame's "playing → playing" transition does
      // nothing.
      let prevRoundPhase: string = "playing";
      let prevRoundNumber: number = 0;
      let prevMatchPhase: string = "playing";
      let prevMatchNumber: number = 0;
      // S155 — self-death + chain-reaction stat hooks.
      // prevAlive tracks the local player's alive state across frames
      // to detect true→false transitions exactly once.
      // prevOwnBombIds carries the set of bombs owned by player.1 in
      // the previous frame; bombs that disappear this frame are a
      // detonation signal. self-death attribution requires a recently-
      // detonated own bomb + the alive flip in the same frame.
      // prevAllBombIds tracks ALL bomb ids — drops in size by ≥2 mean
      // a chain reaction this frame.
      let prevAlive: boolean = true;
      let prevOwnBombIds = new Set<string>();
      let prevAllBombIds = new Set<string>();
      const PICKUP_TOOLTIP_FADE_IN_MS = 150;
      const PICKUP_TOOLTIP_HOLD_MS = 1200;
      const PICKUP_TOOLTIP_FADE_OUT_MS = 300;
      const PICKUP_TOOLTIP_REPLACE_FADE_MS = 100;
      const showPickupTooltip = (kind: string, accent: string): void => {
        // Replacement path: if a tooltip is already on, fast-fade is
        // implicit because we just overwrite the start time + data.
        // Centre-slot bookkeeping mirrors the controls-hint widget.
        if (!pickupTooltipMounted) {
          hud.add(pickupTooltipSpec);
          pickupTooltipMounted = true;
        }
        pickupTooltipKind = kind;
        pickupTooltipStartMs = performance.now();
        hud.update(PICKUP_TOOLTIP_ID, { kind, opacity: 0, accent });
      };

      const colorFor = (id: string): string =>
        id === "player.1" ? "#5fa8ff" : id === "bot.1" ? "#ff7a36" : "#ffffff";

      let bannerMounted = false;
      // S096 KABOOM-TITLE-SCREEN-FADE — when gameStarted flips, kick off
      // a requestAnimationFrame loop that fades the title overlay over
      // TITLE_FADE_MS rather than snapping it off. titleFadeStartMs is
      // set the first frame we observe gameStarted=true; subsequent
      // frames sample fadeOutOpacityCurve(now - start, TITLE_FADE_MS)
      // and either update the widget or remove it once opacity hits 0.
      const TITLE_FADE_MS = 250;
      let titleFadeStartMs: number | undefined;

      // S166 KABOOM-SUDDEN-DEATH-VISUALS — deferred polish from
      // GDP-2026-05-27-013 §VISUAL TREATMENT. On the first tick we
      // observe SuddenDeathState.activated=true, mount a centre
      // banner ("SUDDEN DEATH", red+cream, 1.5s) and a screen-edge
      // red vignette pulse (0.5s fade-in / 0.5s fade-out).
      const SUDDEN_DEATH_BANNER_ID = "kaboom.sudden-death-banner";
      let suddenDeathPulseStartMs: number | undefined;
      let suddenDeathBannerMounted = false;
      let lastSuddenDeathActivated = false;
      // Edge-vignette element — added on demand to the document body.
      let suddenDeathVignette: HTMLElement | undefined;
      const SUDDEN_DEATH_PULSE_TOTAL_MS = 1000;
      const SUDDEN_DEATH_BANNER_TOTAL_MS = 1500;

      const update = (): void => {
        // S096 KABOOM-TITLE-SCREEN-FADE — fade rather than snap.
        if (titleScreenMounted && gameStarted) {
          if (titleFadeStartMs === undefined) {
            titleFadeStartMs = performance.now();
          }
          const elapsed = performance.now() - titleFadeStartMs;
          const opacity = fadeOutOpacityCurve(elapsed, TITLE_FADE_MS);
          if (opacity <= 0) {
            hud.remove(TITLE_ID);
            titleScreenMounted = false;
            titleFadeStartMs = undefined;
          } else {
            hud.update(TITLE_ID, { text: "Kaboom Crew\nPress SPACE to start", opacity });
          }
        }

        // S166 — drive sudden-death banner + vignette pulse.
        try {
          const sdSnap = runtime.snapshot();
          const sdComponents = sdSnap.entities.find((e) => e.id === "kaboom.game-state")?.components as Record<string, unknown> | undefined;
          const sd = sdComponents?.["SuddenDeathState"] as { activated?: boolean } | undefined;
          const activated = sd?.activated === true;
          if (activated && !lastSuddenDeathActivated) {
            suddenDeathPulseStartMs = performance.now();
            // Mount the banner once.
            if (!suddenDeathBannerMounted) {
              hud.add({
                id: SUDDEN_DEATH_BANNER_ID,
                slot: "center" as const,
                initial: { opacity: 0 },
                render: (data: { opacity: number }): HTMLElement => {
                  const el = document.createElement("div");
                  el.setAttribute(
                    "style",
                    [
                      `opacity:${data.opacity}`,
                      "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
                      "font-size:32px",
                      "font-weight:800",
                      "letter-spacing:6px",
                      "color:#f4ede0",
                      "text-shadow:0 0 12px #ff4040,0 0 4px #ff4040",
                      "padding:14px 24px",
                      "background:rgba(255,64,64,0.18)",
                      "border:2px solid #ff4040",
                      "pointer-events:none"
                    ].join(";")
                  );
                  el.textContent = "SUDDEN DEATH";
                  return el;
                }
              } as unknown);
              suddenDeathBannerMounted = true;
            }
            // Mount the vignette once.
            if (suddenDeathVignette === undefined) {
              suddenDeathVignette = document.createElement("div");
              suddenDeathVignette.id = "kaboom-sudden-death-vignette";
              suddenDeathVignette.setAttribute(
                "style",
                [
                  "position:fixed",
                  "inset:0",
                  "pointer-events:none",
                  "z-index:9000",
                  "box-shadow:inset 0 0 120px 60px rgba(255,64,64,0.0)",
                  "transition:box-shadow 0.4s ease-out",
                  "opacity:0"
                ].join(";")
              );
              document.body.appendChild(suddenDeathVignette);
            }
          }
          // Update banner + vignette opacity each tick of the pulse window.
          if (suddenDeathPulseStartMs !== undefined) {
            const elapsedMs = performance.now() - suddenDeathPulseStartMs;
            // Banner fade in 250 ms → hold 1000 ms → fade out 250 ms = 1500 ms.
            let bannerOpacity = 0;
            if (elapsedMs < 250) bannerOpacity = elapsedMs / 250;
            else if (elapsedMs < 1250) bannerOpacity = 1;
            else if (elapsedMs < SUDDEN_DEATH_BANNER_TOTAL_MS) bannerOpacity = 1 - (elapsedMs - 1250) / 250;
            else bannerOpacity = 0;
            if (suddenDeathBannerMounted) {
              hud.update(SUDDEN_DEATH_BANNER_ID, { opacity: bannerOpacity });
              if (elapsedMs >= SUDDEN_DEATH_BANNER_TOTAL_MS) {
                hud.remove(SUDDEN_DEATH_BANNER_ID);
                suddenDeathBannerMounted = false;
              }
            }
            // Vignette pulse: 0 → 0.7 over 400 ms, hold 200 ms, 0.7 → 0 over 400 ms.
            if (suddenDeathVignette !== undefined) {
              let vOpacity = 0;
              if (elapsedMs < 400) vOpacity = elapsedMs / 400;
              else if (elapsedMs < 600) vOpacity = 1;
              else if (elapsedMs < SUDDEN_DEATH_PULSE_TOTAL_MS) vOpacity = 1 - (elapsedMs - 600) / 400;
              else vOpacity = 0;
              suddenDeathVignette.style.opacity = String(vOpacity * 0.7);
              suddenDeathVignette.style.boxShadow = `inset 0 0 ${120 + vOpacity * 40}px ${40 + vOpacity * 60}px rgba(255,64,64,${0.5 * vOpacity})`;
              if (elapsedMs >= Math.max(SUDDEN_DEATH_PULSE_TOTAL_MS, SUDDEN_DEATH_BANNER_TOTAL_MS)) {
                suddenDeathPulseStartMs = undefined;
              }
            }
          }
          // Reset on round restart (activated flips back to false when
          // the new round's SuddenDeathState is missing).
          if (!activated && lastSuddenDeathActivated) {
            if (suddenDeathBannerMounted) {
              hud.remove(SUDDEN_DEATH_BANNER_ID);
              suddenDeathBannerMounted = false;
            }
            suddenDeathPulseStartMs = undefined;
            if (suddenDeathVignette !== undefined) {
              suddenDeathVignette.style.opacity = "0";
            }
          }
          lastSuddenDeathActivated = activated;
        } catch {
          // best-effort — sudden-death is presentation polish.
        }

        const s = api.status() as {
          round?: {
            phase?: string;
            elapsed?: number;
            winnerId?: string;
            roundNumber?: number;
            tally?: { player: number; bot: number; draws: number };
            timeLimit?: number;
            matchTarget?: number;
            matchPhase?: "in-progress" | "won" | "lost" | "draw";
          };
          match?: {
            phase?: "playing" | "resolved";
            target?: number;
            matchNumber?: number;
            lastMatchWinner?: "player" | "bot" | "draw";
            resolvedAt?: number;
          };
          players: ReadonlyArray<{ id: string; gx?: number; gz?: number; alive?: boolean; maxBombs?: number; range?: number; activeBombs?: number; canKick?: boolean; remoteDetonateCharges?: number; shield?: boolean; pierce?: boolean; canThrow?: boolean; bombPass?: boolean; speed?: number; dashCooldownRemainingMs?: number; dashing?: boolean; bluff?: { kind: string; phase: string }; shiftedLabel?: string }>;
          remotePeers?: number;
          bombs: ReadonlyArray<{ id: string; gx?: number; gz?: number; owner?: string }>;
          pickups: ReadonlyArray<{ id: string; gx?: number; gz?: number; kind?: string }>;
        };
        // Stats line — one row per bomber + a persistent score line.
        const lines: string[] = [];
        const phase = s.round?.phase ?? "playing";
        const elapsed = Math.floor(s.round?.elapsed ?? 0);
        const roundNumber = s.round?.roundNumber ?? 1;
        const tally = s.round?.tally ?? { player: 0, bot: 0, draws: 0 };

        // S153 — detect round-just-resolved (phase transitioned from
        // 'playing' to one of 'won' | 'lost' | 'draw' within the same
        // roundNumber). The roundNumber guard prevents a double-count
        // when the auto-restart bumps numbers + phase together.
        if (
          prevRoundPhase === "playing" &&
          phase !== "playing" &&
          roundNumber === prevRoundNumber
        ) {
          const outcome: "won" | "lost" | "draw" =
            phase === "won" ? "won" : phase === "lost" ? "lost" : "draw";
          profileStore.recordRoundOutcome(outcome);
        }
        prevRoundPhase = phase;
        prevRoundNumber = roundNumber;
        // S153 — match transition: phase 'playing' → 'resolved'.
        const profileMatchPhase = s.match?.phase ?? "playing";
        const profileMatchNumber = s.match?.matchNumber ?? 1;
        if (
          prevMatchPhase === "playing" &&
          profileMatchPhase === "resolved" &&
          profileMatchNumber === prevMatchNumber
        ) {
          const winner = s.match?.lastMatchWinner;
          const matchOutcome: "won" | "lost" | "draw" =
            winner === "player" ? "won" : winner === "draw" ? "draw" : "lost";
          profileStore.recordMatchOutcome(matchOutcome);
        }
        prevMatchPhase = profileMatchPhase;
        prevMatchNumber = profileMatchNumber;
        // S115 KABOOM-MATCH-STRUCTURE — promote the tally line to include
        // match info. Format: `Match N | Round R/T | W:n L:n D:n`. When
        // MatchState isn't readable yet (first frame), fall back to the
        // legacy line so the HUD never goes blank.
        const matchNumber = s.match?.matchNumber ?? 1;
        const matchTargetForHud = s.match?.target ?? s.round?.matchTarget ?? 3;
        lines.push(`Match ${matchNumber} | Round ${roundNumber}/${matchTargetForHud}   W:${tally.player} L:${tally.bot} D:${tally.draws}`);
        const timeLimit = s.round?.timeLimit;
        const timeStr = timeLimit !== undefined && timeLimit > 0 ? `t: ${elapsed}s / ${Math.floor(timeLimit)}s` : `t: ${elapsed}s`;
        lines.push(`phase: ${phase}   ${timeStr}`);
        for (const p of s.players) {
          const dead = p.alive === false ? " ✗" : "";
          // S148 — text power-up flags removed; the powerup-grid widget
          // below renders the active state as icons. Stats line keeps
          // bombs/fire for at-a-glance numeric reference only.
          // S265 — when a bot is mid-bluff, append a compact tag so
          // the player can READ the bluff in flight. Tag derived from
          // BotBluffState.kind (filtered out for phase=done upstream).
          let bluffTag = "";
          if (p.bluff !== undefined) {
            const kind = p.bluff.kind;
            if (kind === "fake-flee") bluffTag = " [bait]";
            else if (kind === "decoy-bomb") bluffTag = " [decoy]";
            else if (kind === "feign-corner") bluffTag = " [feint]";
          }
          // S266 — show the L2 personality-shift label when no bluff
          // is in flight (bluff dominates because it's live action).
          let shiftTag = "";
          if (bluffTag === "" && p.shiftedLabel !== undefined) {
            shiftTag = ` [${p.shiftedLabel}]`;
          }
          lines.push(
            `${p.id}${dead}${bluffTag}${shiftTag}   bombs ${p.activeBombs ?? 0}/${p.maxBombs ?? 1}   fire ${p.range ?? 2}`
          );
        }
        // S114 KABOOM-MP-HUD-PEER-COUNT — only render when there are
        // remote bombers in the snapshot. In single-player the line
        // stays hidden (no clutter).
        if ((s.remotePeers ?? 0) > 0) {
          lines.push(`Multiplayer: ${s.remotePeers} peer(s) online`);
        }
        // S89 KABOOM-ROUND-TIMER-BAR — compute fill fraction + urgency
        // color from elapsed / timeLimit. 0 hides the bar (no time
        // limit / round already resolved).
        const elapsedExact = s.round?.elapsed ?? 0;
        let timeFrac = 0;
        let timeColor = "#5fa8ff";
        if (timeLimit !== undefined && timeLimit > 0 && phase === "playing") {
          timeFrac = Math.max(0, Math.min(1, elapsedExact / timeLimit));
          const remaining = Math.max(0, timeLimit - elapsedExact);
          if (remaining <= 5) timeColor = "#ff5a5a";
          else if (remaining <= 15) timeColor = "#ff9b3a";
          else timeColor = "#5fa8ff";
        }
        hud.update(STATS_ID, { lines, timeFrac, timeColor });

        // S87 KABOOM-HUD-KEY-GLYPHS — push live pressed-key set into
        // the glyph widget. api.input() returns the same snapshot that
        // PlayerInputSystem sees, so a stuck key here means the system
        // is also stuck (and the bug is upstream).
        const pressed = api.input();
        hud.update(KEYS_ID, { pressed });

        // S148 KABOOM-POWERUP-HUD — push the local player's stats into
        // the icon grid. Falls back to a clean default state when the
        // self entity is missing (pre-spawn / between rounds).
        const playerSelfForHud = s.players.find((p) => p.id === "player.1");
        const accent = colorFor("player.1");
        if (playerSelfForHud !== undefined) {
          const selfSpeed = playerSelfForHud.speed;
          // S122 — speed bonus level shown is (snapshot speed − baseline 3.5),
          // rounded + clamped to 0. When speed is absent (solo client), the
          // grid reads 0 (baseline).
          const speedLevel = selfSpeed !== undefined && selfSpeed > 3.5
            ? Math.max(0, Math.round(selfSpeed - 3.5))
            : 0;
          // S159 — dash cooldown shown as 0..1 fraction. 3000ms ceiling
          // matches DASH_COOLDOWN_MS in dash-system.ts.
          const dashCdMs = playerSelfForHud.dashCooldownRemainingMs ?? 0;
          const dashCooldownFraction = Math.max(0, Math.min(1, dashCdMs / 3000));
          hud.update(POWERUP_GRID_ID, {
            bombs: { current: playerSelfForHud.activeBombs ?? 0, max: playerSelfForHud.maxBombs ?? 1 },
            fire: playerSelfForHud.range ?? 2,
            speed: speedLevel,
            canKick: playerSelfForHud.canKick === true,
            remote: (playerSelfForHud.remoteDetonateCharges ?? 0) > 0,
            shield: playerSelfForHud.shield === true,
            pierce: playerSelfForHud.pierce === true,
            canThrow: playerSelfForHud.canThrow === true,
            bombPass: playerSelfForHud.bombPass === true,
            dashCooldownFraction,
            accent
          });
        }

        // S150 KABOOM-OPPONENT-BADGES — push per-opponent active-state
        // rows. Static MULTI_BOT_ASSIGNMENT supplies the personality →
        // colour mapping for solo; connected mode (no personality)
        // falls through to the rose accent.
        const opponentRows: Array<OpponentBadgeRow> = [];
        for (const p of s.players) {
          if (!isOpponent(p.id)) continue;
          const icons = badgesForOpponent({
            alive: p.alive,
            shield: p.shield,
            pierce: p.pierce,
            remoteDetonateCharges: p.remoteDetonateCharges,
            canThrow: p.canThrow
          });
          if (icons.length === 0) continue;
          // Personality for solo bots comes from the static assignment
          // table; this stays in sync with kaboom-recipe.ts at compile
          // time. Connected-mode bots don't expose personality in the
          // snapshot yet (GDP-2026-05-27-003 work) → fallback hue.
          const personality = MULTI_BOT_ASSIGNMENT.find((b) => b.id === p.id)?.personality;
          opponentRows.push({
            id: p.id,
            icons,
            accent: opponentAccentColor(personality)
          });
        }
        hud.update(OPPONENT_BADGES_ID, { rows: opponentRows });

        // S148 KABOOM-POWERUP-TOOLTIP — diff prev vs current pickup
        // cells; any pickup that disappeared on the local player's
        // current cell triggers the tooltip. Bot collects fall through
        // silently — preserves the "where did that go" tension per the
        // GDP §6.2 OUT-OF-SCOPE note.
        const currentPickupCells = new Map<string, string>();
        for (const pk of s.pickups) {
          if (pk.gx === undefined || pk.gz === undefined || pk.kind === undefined) continue;
          currentPickupCells.set(`${pk.gx},${pk.gz}`, pk.kind);
        }
        if (playerSelfForHud?.gx !== undefined && playerSelfForHud?.gz !== undefined) {
          const selfKey = `${playerSelfForHud.gx},${playerSelfForHud.gz}`;
          const wasHere = prevPickupCells.get(selfKey);
          if (wasHere !== undefined && !currentPickupCells.has(selfKey)) {
            showPickupTooltip(wasHere, accent);
            // S153 — lifetime stat: per-kind pickup counter.
            profileStore.recordPickup(wasHere);
          }
        }
        prevPickupCells = currentPickupCells;

        // S155 — self-death + chain-reaction stat hooks.
        // Pull bomb ids from the snapshot. own-bomb subset is filtered
        // by ownerId === LOCAL_BOMBER_ID. We diff against the
        // previous frame's sets to detect detonations this frame.
        const currentAllBombIds = new Set<string>();
        const currentOwnBombIds = new Set<string>();
        for (const b of s.bombs) {
          currentAllBombIds.add(b.id);
          if (b.owner === "player.1") currentOwnBombIds.add(b.id);
        }
        // Chain reactions: ≥ 2 bombs detonated (disappeared) this frame.
        let disappearedTotal = 0;
        for (const id of prevAllBombIds) {
          if (!currentAllBombIds.has(id)) disappearedTotal += 1;
        }
        if (disappearedTotal >= 2) profileStore.recordChain(disappearedTotal);
        // Self-death: local player alive flipped true → false AND at
        // least one own bomb disappeared this frame (the detonation
        // that did it). Tight attribution — chained-from-bot-bomb
        // cases don't count.
        const aliveNow = playerSelfForHud?.alive ?? true;
        if (prevAlive && !aliveNow) {
          let ownDisappeared = 0;
          for (const id of prevOwnBombIds) {
            if (!currentOwnBombIds.has(id)) ownDisappeared += 1;
          }
          if (ownDisappeared > 0) profileStore.recordSelfDeath();
        }
        prevAlive = aliveNow;
        prevOwnBombIds = currentOwnBombIds;
        prevAllBombIds = currentAllBombIds;

        // S156 KABOOM-COSMETIC-UNLOCKS — run the checker each frame
        // (cheap: a 5-entry array scan). Persists newly-unlocked ids
        // to the profile + enqueues a banner. Banner queue + lifecycle
        // is driven by the dedicated state machine below.
        {
          const live = profileStore.get();
          const result = checkUnlocks(live.lifetimeStats, live.cosmeticUnlocks);
          if (result.newlyUnlocked.length > 0) {
            profileStore.setUnlocks(result.allUnlocked);
            enqueueUnlockBanners(result.newlyUnlocked);
          }
        }
        // S156 — banner lifecycle. Promotes the next queued banner
        // when the current one finishes its fade-out (or no banner
        // is showing yet). 2.5s total per banner.
        if (unlockBannerMounted && unlockBannerStartMs !== undefined && unlockBannerCurrentId !== undefined) {
          const age = performance.now() - unlockBannerStartMs;
          let opacity = 0;
          if (age < UNLOCK_BANNER_FADE_IN_MS) {
            opacity = age / UNLOCK_BANNER_FADE_IN_MS;
          } else if (age < UNLOCK_BANNER_FADE_IN_MS + UNLOCK_BANNER_HOLD_MS) {
            opacity = 1;
          } else {
            const fadeOut = age - UNLOCK_BANNER_FADE_IN_MS - UNLOCK_BANNER_HOLD_MS;
            opacity = Math.max(0, 1 - fadeOut / UNLOCK_BANNER_FADE_OUT_MS);
          }
          if (opacity <= 0 && age > UNLOCK_BANNER_FADE_IN_MS + UNLOCK_BANNER_HOLD_MS) {
            hud.remove(UNLOCK_BANNER_ID);
            unlockBannerMounted = false;
            unlockBannerCurrentId = undefined;
            unlockBannerStartMs = undefined;
            // Promote the next queued one — small gap is implicit
            // (next frame).
          } else {
            hud.update(UNLOCK_BANNER_ID, { unlockId: unlockBannerCurrentId, opacity });
          }
        } else if (unlockBannerQueue.length > 0) {
          promoteNextUnlockBanner();
        }

        // S155 — push the live lifetime stats into the HUD widget,
        // but only when the user opted in via `?showLifetime=true`.
        if (showLifetime) {
          const p = profileStore.get();
          hud.update(LIFETIME_HUD_ID, {
            matchesPlayed: p.lifetimeStats.matchesPlayed,
            matchesWon: p.lifetimeStats.matchesWon,
            roundsPlayed: p.lifetimeStats.roundsPlayed,
            roundsWon: p.lifetimeStats.roundsWon,
            roundsDraw: p.lifetimeStats.roundsDraw,
            roundsLost: p.lifetimeStats.roundsLost,
            deathsByOwnBomb: p.lifetimeStats.deathsByOwnBomb,
            maxChainLength: p.lifetimeStats.maxChainLength
          });
        }

        // S148 — drive the pickup-tooltip lifecycle (fade-in / hold /
        // fade-out). Holding time is short on purpose — the icon grid
        // carries the persistent state, the tooltip just teaches what
        // was just collected.
        if (pickupTooltipMounted && pickupTooltipStartMs !== undefined && pickupTooltipKind !== undefined) {
          const age = performance.now() - pickupTooltipStartMs;
          let opacity = 0;
          if (age < PICKUP_TOOLTIP_FADE_IN_MS) {
            opacity = age / PICKUP_TOOLTIP_FADE_IN_MS;
          } else if (age < PICKUP_TOOLTIP_FADE_IN_MS + PICKUP_TOOLTIP_HOLD_MS) {
            opacity = 1;
          } else {
            const fadeOut = age - PICKUP_TOOLTIP_FADE_IN_MS - PICKUP_TOOLTIP_HOLD_MS;
            opacity = Math.max(0, 1 - fadeOut / PICKUP_TOOLTIP_FADE_OUT_MS);
          }
          if (opacity <= 0 && age > PICKUP_TOOLTIP_FADE_IN_MS + PICKUP_TOOLTIP_HOLD_MS) {
            hud.remove(PICKUP_TOOLTIP_ID);
            pickupTooltipMounted = false;
            pickupTooltipKind = undefined;
            pickupTooltipStartMs = undefined;
          } else {
            hud.update(PICKUP_TOOLTIP_ID, { kind: pickupTooltipKind, opacity, accent });
          }
        }
        // Reference unused constants to keep the linter happy until the
        // replace-fade animation lands (kept named for future use).
        void PICKUP_TOOLTIP_REPLACE_FADE_MS;

        // S91 KABOOM-AUDIO-POSITIONAL-ADOPT. Update the AudioListener
        // to track the local player so positional SFX pan relative
        // to them. Read player.1's live cell from the status snapshot
        // we already paid for above.
        const playerSelf = s.players.find((p) => p.id === "player.1");
        if (playerSelf?.gx !== undefined && playerSelf?.gz !== undefined) {
          audioFx.setListenerPosition(playerSelf.gx, 0, playerSelf.gz);
        }

        // S85 KABOOM-CONTROLS-HINT — gate against the banner (which
        // also wants the centre slot once the round resolves). Mount
        // once the title screen is dismissed; unmount after 4 s OR
        // as soon as the banner needs the slot.
        const hintWindowOpen =
          gameStarted &&
          phase === "playing" &&
          performance.now() - gameStartedAtMs < 4000;
        if (hintWindowOpen && !controlsHintMounted && !bannerMounted) {
          hud.add(controlsHintSpec);
          controlsHintMounted = true;
          controlsHintFadeStartMs = undefined;
        } else if (controlsHintMounted && (!hintWindowOpen || bannerMounted)) {
          // S097 KABOOM-CONTROLS-HINT-FADE — kick the fade on the
          // first frame the hint should leave, then unmount after
          // CONTROLS_HINT_FADE_MS. Setting controlsHintFadeStartMs
          // here means subsequent ticks land in the else-if-fading
          // branch below.
          if (controlsHintFadeStartMs === undefined) {
            controlsHintFadeStartMs = performance.now();
          }
          const elapsed = performance.now() - controlsHintFadeStartMs;
          const opacity = fadeOutOpacityCurve(elapsed, CONTROLS_HINT_FADE_MS) * 0.85;
          if (opacity <= 0) {
            hud.remove(CONTROLS_HINT_ID);
            controlsHintMounted = false;
            controlsHintFadeStartMs = undefined;
          } else {
            hud.update(CONTROLS_HINT_ID, { opacity });
          }
        }

        // Banner — empty while playing, mounted otherwise.
        // S87 KABOOM-MATCH-BEST-OF-5 — once the match resolves the
        // banner takes over with the match outcome.
        // S115 KABOOM-MATCH-STRUCTURE — read MatchState (canonical);
        // copy now reads `MATCH N — YOU WIN` (matchNumber + larger
        // text via the banner CSS), and the auto-restart message
        // reflects the longer 7 s post-match pause.
        let bannerText = "";
        const matchPhase = s.round?.matchPhase;
        const matchTarget = s.match?.target ?? s.round?.matchTarget ?? 3;
        const matchOver = s.match?.phase === "resolved" || (matchPhase !== undefined && matchPhase !== "in-progress");
        const matchWinner = s.match?.lastMatchWinner;
        if (matchOver) {
          const n = s.match?.matchNumber ?? 1;
          if (matchWinner === "player" || matchPhase === "won") bannerText = `MATCH ${n} — YOU WIN\nFirst to ${matchTarget}. Next match in 7 s (R now)`;
          else if (matchWinner === "bot" || matchPhase === "lost") bannerText = `MATCH ${n} — YOU LOSE\nBot reached ${matchTarget}. Next match in 7 s (R now)`;
          else if (matchWinner === "draw" || matchPhase === "draw") bannerText = `MATCH ${n} — DRAW\nBoth reached ${matchTarget}. Next match in 7 s (R now)`;
        } else if (phase === "won") bannerText = "YOU WIN — restart in 3 s (R)";
        else if (phase === "lost") bannerText = "YOU LOST — restart in 3 s (R)";
        else if (phase === "draw") bannerText = "DRAW — restart in 3 s (R)";
        if (bannerText !== "" && !bannerMounted) {
          hud.add(bannerSpec);
          bannerMounted = true;
        } else if (bannerText === "" && bannerMounted) {
          hud.remove(BANNER_ID);
          bannerMounted = false;
        }
        if (bannerMounted) hud.update(BANNER_ID, { text: bannerText });

        // Minimap markers — players + bots + bombs + pickups.
        const markers: Array<{ x: number; z: number; color: string; shape?: "dot" | "rect" | "triangle"; size?: number }> = [];
        for (const p of s.players) {
          if (p.gx === undefined || p.gz === undefined) continue;
          markers.push({
            x: p.gx,
            z: p.gz,
            color: p.alive === false ? "#666" : colorFor(p.id),
            shape: "triangle",
            size: 5
          });
        }
        for (const b of s.bombs) {
          if (b.gx === undefined || b.gz === undefined) continue;
          markers.push({ x: b.gx, z: b.gz, color: "#222", shape: "dot", size: 3 });
        }
        for (const pk of s.pickups) {
          if (pk.gx === undefined || pk.gz === undefined) continue;
          const color = pk.kind === "bomb-up" ? "#5fa8ff" : pk.kind === "fire-up" ? "#ff7a36" : "#7be35f";
          markers.push({ x: pk.gx, z: pk.gz, color, shape: "rect", size: 4 });
        }
        // S90 KABOOM-MINIMAP-DANGER-OVERLAY — project live blast
        // cells and paint them as red cell-sized overlays under the
        // marker list. Skipped when occupancy isn't bound yet.
        const cells: Array<{ x: number; z: number; size?: number; color?: string }> = [];
        if (_boundOccupancy !== undefined) {
          const danger = projectedBlastCells(runtime.world, _boundOccupancy);
          for (const d of danger) {
            cells.push({ x: d.gx, z: d.gz, size: 1 });
          }
        }
        hud.update(MINIMAP_ID, { markers, cells });

        rafId = requestAnimationFrame(update);
      };
      rafId = requestAnimationFrame(update);

      hudCleanup = (): void => {
        if (rafId !== undefined) cancelAnimationFrame(rafId);
        rafId = undefined;
        hud.remove(STATS_ID);
        if (bannerMounted) hud.remove(BANNER_ID);
        if (titleScreenMounted) hud.remove(TITLE_ID);
        if (controlsHintMounted) hud.remove(CONTROLS_HINT_ID);
        if (pauseMenuMounted) hud.remove(PAUSE_MENU_ID);
        hud.remove(MINIMAP_ID);
        hud.remove(KEYS_ID);
        if (tooltipOverlay !== undefined) tooltipOverlay.destroy();
        if (suddenDeathBannerMounted) hud.remove(SUDDEN_DEATH_BANNER_ID);
        if (suddenDeathVignette !== undefined) {
          suddenDeathVignette.remove();
          suddenDeathVignette = undefined;
        }
      };
    }

    return {
      dispose(): void {
        window.removeEventListener("keydown", handleKey);
        if (w.__agf !== undefined) delete w.__agf.kaboom;
        _boundRestart = undefined;
        _boundAudioEvent = undefined;
        _boundPlayerInput = undefined;
        _boundOccupancy = undefined;
        _audioLog = [];
        audioFx.dispose();
        if (hudCleanup !== undefined) hudCleanup();
      }
    };
  },

  resetRound(runtime: RuntimeHandle): number {
    return restartScene(runtime);
  },

  // S109 KABOOM-MULTIPLAYER-FOUNDATION — small status string in the
  // dev panel telling the user they're in multiplayer mode + who
  // they are. Matches beacon-world's pattern. Connect-and-spectate
  // is the only mode today — each tab plays its own arena, only
  // bomber positions sync.
  renderConnectivityHint(input: ProjectConnectivityHintInput): string {
    if (input.serverUrl === undefined || !input.networked) return "";
    const safeUrl = escapeText(input.serverUrl);
    const safePlayer = escapeText(input.playerId ?? "client");
    return `<p class="status-copy" data-testid="multiplayer-status">Kaboom Crew multiplayer (spectate): connected to <code>${safeUrl}</code> as <code>${safePlayer}</code>. Open this URL in another tab with a different <code>?playerId=</code> to see another bomber join.</p>`;
  }
};

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
