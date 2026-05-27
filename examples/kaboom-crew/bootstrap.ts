import { expandScenePrefabs, type PrefabDefinition } from "../../engine/core/scene/expand-prefabs";
import { createGridOccupancySystem } from "../../engine/core/systems/grid-occupancy-system";
import { createGridMovementSystem } from "../../engine/core/systems/grid-movement-system";
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
import plazaSceneJson from "./scenes/plaza.scene.json";
import crossSceneJson from "./scenes/cross.scene.json";
import pitSceneJson from "./scenes/pit.scene.json";
import beltZoneSceneJson from "./scenes/belt-zone.scene.json";
import warpfieldSceneJson from "./scenes/warpfield.scene.json";
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

// S104 KABOOM-MIGRATE-PREFABS + S139 KABOOM-BOT-PERSONALITY-VISUALS.
// The pure recipe derivation lives in ./src/kaboom-recipe so it can
// be unit-tested without bootstrapping a runtime. S141 — multi-bot
// solo assignment lives there too.
import { makeKaboomRecipe, MULTI_BOT_ASSIGNMENT, MULTI_BOT_IDS } from "./src/kaboom-recipe";
import { createKaboomPlayerInputSystem } from "./src/systems/player-input-system";
import { createKaboomBombPlacementSystem } from "./src/systems/bomb-placement-system";
import { createKaboomPlaceBombNetworkRelaySystem } from "./src/systems/place-bomb-network-relay-system";
import { createKaboomConnectedBlastDecoderSystem } from "./src/systems/connected-blast-decoder-system";
import { createKaboomBombKickSystem } from "./src/systems/bomb-kick-system";
import { createKaboomBombFuseSystem } from "./src/systems/bomb-fuse-system";
import { createKaboomBombPickupSystem } from "./src/systems/bomb-pickup-system";
import { createKaboomBombThrowSystem } from "./src/systems/bomb-throw-system";
import { createKaboomConveyorBeltSystem } from "./src/systems/conveyor-belt-system";
import { createKaboomWarpHoleSystem } from "./src/systems/warp-hole-system";
import { createKaboomBlastPropagationSystem } from "./src/systems/blast-propagation-system";
import { createKaboomHitRecoilSystem } from "./src/systems/hit-recoil-system";
import { createKaboomBlastTileLifetimeSystem } from "./src/systems/blast-tile-lifetime-system";
import { createKaboomRoundResolveSystem } from "./src/systems/round-resolve-system";
import { createKaboomBotAISystem } from "./src/systems/bot-ai-system";
import { createKaboomAgentGotoSystem } from "./src/systems/agent-goto-system";
import { createKaboomRemoteBomberDecoratorSystem } from "./src/systems/remote-bomber-decorator-system";
import { createKaboomRemoteBomberInterpolatorSystem } from "./src/systems/remote-bomber-interpolator-system";
import { createKaboomPickupSpawnSystem } from "./src/systems/pickup-spawn-system";
import { createKaboomPickupCollectSystem } from "./src/systems/pickup-collect-system";
import { createKaboomAudioBindingSystem, type AudioEventKind } from "./src/systems/audio-binding-system";
import { createKaboomCameraShakeSystem } from "./src/systems/camera-shake-system";
import { createKaboomDeathTriggerSystem } from "./src/systems/death-trigger-system";
import { projectedBlastCells } from "./src/danger";
import { createKaboomAudioFx, resolveAudioVolume } from "./src/audio-fx";
import { forwardAudioEvent } from "./src/audio-event-forward";
// S148 KABOOM-POWERUP-HUD — icon grid + pickup tooltip widgets read
// the same per-frame snapshot the stats line uses.
import {
  PICKUP_ICON,
  PICKUP_TOOLTIP_LABEL,
  powerupIconSvgInner,
  type PowerupIconKind
} from "./src/powerup-icons";
// S150 KABOOM-OPPONENT-BADGES — Layer 3 of GDP-2026-05-27-005 (HUD
// approximation; world-space billboards deferred to a follow-up).
import {
  badgesForOpponent,
  isOpponent,
  opponentAccentColor
} from "./src/opponent-badges";
import { difficultyComponentPatch, readDifficultyFromUrl, resolveSessionBotPersonality, type BotPersonality } from "./src/difficulty";
import { upsertEntityCommands } from "./src/bootstrap-helpers";
import { resolveSessionMap } from "./src/map-pick";

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
  ["plaza", plazaSceneJson],
  ["cross", crossSceneJson],
  ["pit", pitSceneJson],
  ["belt-zone", beltZoneSceneJson],
  ["warpfield", warpfieldSceneJson]
]);
type MapName = "start" | "wide" | "corridor" | "plaza" | "cross" | "pit" | "belt-zone" | "warpfield";
let activeMapName: MapName = "start";
// Seed from `?map=` once at module load — module evaluation happens
// after the page is opened, so `location.search` is already valid.
function seedActiveMapFromUrl(): void {
  activeMapName = readMapName();
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
  const patched = new Set<string>();
  const tick = (): void => {
    try {
      const snap = runtime.snapshot();
      const registry = runtime.renderer.meshRegistry();
      for (const entity of snap.entities) {
        if (patched.has(entity.id)) continue;
        const mr = (entity.components as Record<string, { mesh?: string } | undefined>)["MeshRenderer"];
        const key = mr?.mesh;
        if (typeof key !== "string") continue;
        if (!key.startsWith("procedural:procbomber") && !key.startsWith("procedural:accessory-")) continue;
        const handle = registry.handleFor(entity.id);
        if (handle === undefined) continue;
        runtime.renderer.adapter.setMeshMaterialPatch(handle, { vertexColors: true });
        patched.add(entity.id);
      }
    } catch {
      // best-effort — first frames before runtime is fully ready may
      // surface transient errors; skip and try again next frame.
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
  runtime.applyCommands([
    { kind: "scene.load", scene: buildFlatStartScene() },
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
        MatchState: { phase: "playing", target: matchTarget, matchNumber: nextMatchNumber }
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
  const playerRecipe = makeKaboomRecipe("player.1");
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

export const kaboomCrewBootstrap: ProjectBootstrap = {
  registerSystems({ scheduler, playerId, networked, getNetwork }: ProjectBootstrapContext): void {
    _networkedMode = networked;
    const occupancy = createGridOccupancySystem();
    _boundOccupancy = occupancy;
    scheduler.register(occupancy, { profiles: ["static", "connected"] });

    scheduler.register(createGridMovementSystem({ occupancy }), { profiles: ["static", "connected"] });
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
    // S117 KABOOM-MP-SPRINT-B — fuse-system stays on the static path
    // only. On the connected profile the server is authoritative on the
    // fuse + emits blastEvent when it hits zero; running the local fuse
    // would double-detonate.
    scheduler.register(createKaboomBombFuseSystem(), { profiles: ["static"] });
    // S84 KABOOM-AUDIO-WIRE — register BEFORE blast-propagation so the
    // binding system sees the BlastEvent transient before propagation
    // consumes it. The late-bound closure indirects to attachUi where
    // the audio bus is finally available.
    scheduler.register(
      createKaboomAudioBindingSystem({
        onEvent(kind, c): void {
          if (_boundAudioEvent !== undefined) _boundAudioEvent(kind, c);
        }
      }),
      { profiles: ["static", "connected"] }
    );

    // S87 KABOOM-CAMERA-SHAKE — observe BlastEvent transients BEFORE
    // blast-propagation consumes them. Perturbs the active camera's
    // Transform.position; intensity scales with blast range.
    scheduler.register(createKaboomCameraShakeSystem(), { profiles: ["static", "connected"] });

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
    // S109 KABOOM-HIT-RECOIL — runs RIGHT AFTER blast propagation so the
    // HitRecoilRequest transient blast-propagation just wrote is consumed
    // in the same fixedUpdate (one-shot, no carry-over).
    scheduler.register(createKaboomHitRecoilSystem(), { profiles: ["static", "connected"] });
    // S121 — connected-blast-decoder now spawns BlastTile entities
    // from server's blastEvent.cells; this system decays them.
    scheduler.register(createKaboomBlastTileLifetimeSystem({ occupancy }), { profiles: ["static", "connected"] });
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
    scheduler.register(createKaboomBotAISystem({ occupancy, seed: 1337 }), { profiles: ["static"] });

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
    const initialBatch: EngineCommand[] = [
      // S84 + S115 — single kaboom.game-state singleton carries
      // GamePaused (title-screen / pause overlay) AND MatchState
      // (best-of-N session).
      ...upsertEntityCommands(runtime.world, "kaboom.game-state", {
        GamePaused: { reason: "title-screen" },
        MatchState: { phase: "playing", target: readMatchTargetFromUrl() ?? 3, matchNumber: 1 }
      }),
      // S85 KABOOM-ROUND-TIMER. Seed RoundState up-front so the timeLimit is
      // present from frame 0 — RoundResolveSystem's ensureRoundState would
      // otherwise create a singleton without it.
      ...upsertEntityCommands(runtime.world, "kaboom.round-state", {
        RoundState: {
          phase: "playing",
          elapsed: 0,
          roundNumber: 1,
          tally: { player: 0, bot: 0, draws: 0 },
          timeLimit: readRoundTimeLimit(),
          matchTarget: readMatchTargetFromUrl() ?? 3
        }
      })
    ];
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
    const playerRecipe = makeKaboomRecipe("player.1");
    const recipePersonalityById = new Map<string, BotPersonality>(
      _networkedMode ? [] : MULTI_BOT_ASSIGNMENT.map((b) => [b.id, b.personality] as const)
    );
    registerProcbomberBuilders(
      runtime.renderer,
      (ownerId) => makeKaboomRecipe(ownerId, recipePersonalityById.get(ownerId))
    );
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
    const audioFx = createKaboomAudioFx({ masterGain: 0.4 * dial });
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
          // persist to the same localStorage key the volume dial uses.
          // Muted state writes "0"; unmuting restores "1" so a future
          // ?audio= override still takes precedence over the stored value.
          const audioBtn = mkBtn(`Audio: ${audioFx.isMuted() ? "OFF" : "ON"}`, () => {
            const next = !audioFx.isMuted();
            audioFx.setMuted(next);
            try {
              const storage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
              storage?.setItem("agf.audio.volume", next ? "0" : "1");
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
              targetGx: (c["AgentGoto"] as { targetGx?: number })?.targetGx,
              targetGz: (c["AgentGoto"] as { targetGz?: number })?.targetGz
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
    if (hud !== undefined && typeof globalThis.requestAnimationFrame === "function") {
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
        accent: string;
      };
      const buildIconCell = (
        kind: PowerupIconKind,
        active: boolean,
        label: string | undefined,
        accent: string
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
          row1.appendChild(buildIconCell("bomb", true, `${data.bombs.current}/${data.bombs.max}`, data.accent));
          row1.appendChild(buildIconCell("fire", true, String(data.fire), data.accent));
          // Speed shows the *bonus level* (0+); 0 reads as "baseline" so
          // we still light the icon at the baseline state.
          row1.appendChild(buildIconCell("speed", true, `+${data.speed}`, data.accent));
          el.appendChild(row1);
          const row2 = document.createElement("div");
          row2.setAttribute("style", "display:flex;gap:3px;");
          row2.appendChild(buildIconCell("kick", data.canKick, undefined, data.accent));
          row2.appendChild(buildIconCell("remote", data.remote, undefined, data.accent));
          row2.appendChild(buildIconCell("shield", data.shield, undefined, data.accent));
          row2.appendChild(buildIconCell("pierce", data.pierce, undefined, data.accent));
          row2.appendChild(buildIconCell("throw-glove", data.canThrow, undefined, data.accent));
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
              rowEl.appendChild(wrap);
            }
            el.appendChild(rowEl);
          }
          return el;
        }
      });

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
          players: ReadonlyArray<{ id: string; gx?: number; gz?: number; alive?: boolean; maxBombs?: number; range?: number; activeBombs?: number; canKick?: boolean; remoteDetonateCharges?: number; shield?: boolean; pierce?: boolean; canThrow?: boolean; speed?: number }>;
          remotePeers?: number;
          bombs: ReadonlyArray<{ id: string; gx?: number; gz?: number }>;
          pickups: ReadonlyArray<{ id: string; gx?: number; gz?: number; kind?: string }>;
        };
        // Stats line — one row per bomber + a persistent score line.
        const lines: string[] = [];
        const phase = s.round?.phase ?? "playing";
        const elapsed = Math.floor(s.round?.elapsed ?? 0);
        const roundNumber = s.round?.roundNumber ?? 1;
        const tally = s.round?.tally ?? { player: 0, bot: 0, draws: 0 };
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
          lines.push(
            `${p.id}${dead}   bombs ${p.activeBombs ?? 0}/${p.maxBombs ?? 1}   fire ${p.range ?? 2}`
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
          hud.update(POWERUP_GRID_ID, {
            bombs: { current: playerSelfForHud.activeBombs ?? 0, max: playerSelfForHud.maxBombs ?? 1 },
            fire: playerSelfForHud.range ?? 2,
            speed: speedLevel,
            canKick: playerSelfForHud.canKick === true,
            remote: (playerSelfForHud.remoteDetonateCharges ?? 0) > 0,
            shield: playerSelfForHud.shield === true,
            pierce: playerSelfForHud.pierce === true,
            canThrow: playerSelfForHud.canThrow === true,
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
          }
        }
        prevPickupCells = currentPickupCells;

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
