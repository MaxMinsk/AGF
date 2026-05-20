import { expandScenePrefabs, type PrefabDefinition } from "../../engine/core/scene/expand-prefabs";
import { createGridOccupancySystem } from "../../engine/core/systems/grid-occupancy-system";
import { createGridMovementSystem } from "../../engine/core/systems/grid-movement-system";
import type { SceneInput } from "../../engine/core/ecs/types";
import type {
  ProjectBootstrap,
  ProjectBootstrapContext,
  ProjectUiContext,
  ProjectUiHandle
} from "../../engine/runtime/project-bootstrap";
import type { RuntimeHandle } from "../../engine/runtime/start";
import { createMinimapWidget } from "../../engine/runtime/ui/minimap";
import startSceneJson from "./scenes/start.scene.json";
import wideSceneJson from "./scenes/wide.scene.json";
// Static prefab imports. Vite picks them up at build time so the
// restart path doesn't have to round-trip through `import.meta.glob`.
import playerPrefab from "./prefabs/player.prefab.json";
import botPrefab from "./prefabs/bot.prefab.json";
import softBlockPrefab from "./prefabs/soft-block.prefab.json";
import hardBlockPrefab from "./prefabs/hard-block.prefab.json";
import bombPrefab from "./prefabs/bomb.prefab.json";
import { createKaboomPlayerInputSystem } from "./src/systems/player-input-system";
import { createKaboomBombPlacementSystem } from "./src/systems/bomb-placement-system";
import { createKaboomBombFuseSystem } from "./src/systems/bomb-fuse-system";
import { createKaboomBlastPropagationSystem } from "./src/systems/blast-propagation-system";
import { createKaboomBlastTileLifetimeSystem } from "./src/systems/blast-tile-lifetime-system";
import { createKaboomRoundResolveSystem } from "./src/systems/round-resolve-system";
import { createKaboomBotAISystem } from "./src/systems/bot-ai-system";
import { createKaboomAgentGotoSystem } from "./src/systems/agent-goto-system";
import { createKaboomPickupSpawnSystem } from "./src/systems/pickup-spawn-system";
import { createKaboomPickupCollectSystem } from "./src/systems/pickup-collect-system";
import { createKaboomAudioBindingSystem, type AudioEventKind } from "./src/systems/audio-binding-system";
import { createKaboomCameraShakeSystem } from "./src/systems/camera-shake-system";
import { createKaboomDeathAnimationSystem } from "./src/systems/death-animation-system";
import { projectedBlastCells } from "./src/danger";
import { createKaboomAudioFx, resolveAudioVolume } from "./src/audio-fx";
import { difficultyComponentPatch, readDifficultyFromUrl } from "./src/difficulty";

const DEFAULT_ROUND_TIME_LIMIT_SECONDS = 90;
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
  ["wide", wideSceneJson]
]);
type MapName = "start" | "wide";
let activeMapName: MapName = "start";
// Seed from `?map=` once at module load — module evaluation happens
// after the page is opened, so `location.search` is already valid.
function seedActiveMapFromUrl(): void {
  activeMapName = readMapName();
}

function readMapName(): MapName {
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return "start";
  try {
    const value = new URLSearchParams(search).get("map");
    if (value !== null && MAP_REGISTRY.has(value)) return value as MapName;
    return "start";
  } catch {
    return "start";
  }
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
    | { roundNumber?: number; tally?: { player: number; bot: number; draws: number }; matchPhase?: string }
    | undefined;
  const matchOver = prev?.matchPhase !== undefined && prev.matchPhase !== "in-progress";
  const nextRoundNumber = matchOver ? 1 : (prev?.roundNumber ?? 1) + 1;
  const tally = matchOver ? { player: 0, bot: 0, draws: 0 } : (prev?.tally ?? { player: 0, bot: 0, draws: 0 });
  // S84 KABOOM-BOT-DIFFICULTY. Re-apply the URL preset on every
  // restart so a difficulty change without reload still kicks in next
  // round. Browser-only — `globalThis.location` is undefined in node.
  const preset = readDifficultyFromUrl(
    (globalThis as unknown as { location?: { search?: string } }).location?.search
  );
  const tuning = difficultyComponentPatch(preset);
  runtime.applyCommands([
    { kind: "scene.load", scene: buildFlatStartScene() },
    {
      kind: "entity.create",
      entityId: "kaboom.round-state",
      components: {
        RoundState: { phase: "playing", elapsed: 0, roundNumber: nextRoundNumber, tally, timeLimit: readRoundTimeLimit(), matchTarget: 3, matchPhase: "in-progress" }
      }
    },
    { kind: "component.set", entityId: "bot.1", component: "BotBrain", data: tuning.BotBrain },
    { kind: "component.set", entityId: "bot.1", component: "BomberStats", data: tuning.BomberStats },
    { kind: "component.set", entityId: "bot.1", component: "GridMover", data: tuning.GridMover },
    // S87 KABOOM-PLAYER-VS-BOT-COLOR — re-apply on every restart.
    { kind: "component.set", entityId: "player.1", component: "MeshRenderer", data: { mesh: "sphere", color: "#5fa8ff" } },
    { kind: "component.set", entityId: "bot.1", component: "MeshRenderer", data: { mesh: "sphere", color: "#ff5a6e" } }
  ]);
  return 1;
}

// Late-bound restart callback. registerSystems runs before attachUi, so
// the runtime handle isn't available when RoundResolveSystem is built —
// the system holds this closure and attachUi populates `_boundRestart`
// once the runtime is known. Cleared in dispose to release the handle.
let _boundRestart: (() => void) | undefined;

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
let _boundAudioEvent: ((kind: AudioEventKind, ctx?: { entityId?: string }) => void) | undefined;
let _audioLog: AudioLogEntry[] = [];

export const kaboomCrewBootstrap: ProjectBootstrap = {
  registerSystems({ scheduler }: ProjectBootstrapContext): void {
    const occupancy = createGridOccupancySystem();
    _boundOccupancy = occupancy;
    scheduler.register(occupancy, { profiles: ["static"] });

    scheduler.register(createGridMovementSystem({ occupancy }), { profiles: ["static"] });
    const playerInput = createKaboomPlayerInputSystem();
    _boundPlayerInput = playerInput;
    scheduler.register(playerInput, { profiles: ["static"] });

    // Bomb pipeline.
    scheduler.register(createKaboomBombPlacementSystem({ occupancy }), { profiles: ["static"] });
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
      { profiles: ["static"] }
    );

    // S87 KABOOM-CAMERA-SHAKE — observe BlastEvent transients BEFORE
    // blast-propagation consumes them. Perturbs the active camera's
    // Transform.position; intensity scales with blast range.
    scheduler.register(createKaboomCameraShakeSystem(), { profiles: ["static"] });

    // S90 KABOOM-DEATH-FALL — tweens the dying bomber's rotation
    // toward a tipped-over pose. Reads `DeathAnim` written by
    // audio-binding-system on the alive→dead edge.
    scheduler.register(createKaboomDeathAnimationSystem(), { profiles: ["static"] });

    scheduler.register(createKaboomBlastPropagationSystem({ occupancy }), { profiles: ["static"] });
    scheduler.register(createKaboomBlastTileLifetimeSystem({ occupancy }), { profiles: ["static"] });

    // S82 KABOOM-PICKUPS-AND-STATS. Spawn runs in fixedUpdate AFTER
    // blast-propagation so it sees the SoftBlockDestroyedEvent
    // transients from this step. Collect runs alongside in fixedUpdate
    // so a bomber walking onto a pickup is picked up on the same step.
    scheduler.register(createKaboomPickupSpawnSystem({ seed: 0xc0ffee }), { profiles: ["static"] });
    scheduler.register(createKaboomPickupCollectSystem({ occupancy }), { profiles: ["static"] });

    // Bot AI runs in fixedUpdate so per-frame variance doesn't change
    // decisions; seeded RNG keeps replay recordings reproducible.
    scheduler.register(createKaboomBotAISystem({ occupancy, seed: 1337 }), { profiles: ["static"] });

    // Round resolve gets a late-bound onRestart closure so it can fire
    // the auto-restart timer (default 3 s after win/loss/draw) without
    // requiring the player to press R. The runtime handle becomes
    // available in attachUi, which populates `_boundRestart`.
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
    scheduler.register(createKaboomAgentGotoSystem({ occupancy }), { profiles: ["static"] });
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
    const initialTuning = difficultyComponentPatch(initialPreset);
    runtime.applyCommands([
      {
        kind: "entity.create",
        entityId: "kaboom.game-state",
        components: {
          GamePaused: { reason: "title-screen" }
        }
      },
      // S85 KABOOM-ROUND-TIMER. Seed RoundState up-front so the timeLimit is
      // present from frame 0 — RoundResolveSystem's ensureRoundState would
      // otherwise create a singleton without it.
      {
        kind: "entity.create",
        entityId: "kaboom.round-state",
        components: {
          RoundState: { phase: "playing", elapsed: 0, roundNumber: 1, tally: { player: 0, bot: 0, draws: 0 }, timeLimit: readRoundTimeLimit() }
        }
      },
      { kind: "component.set", entityId: "bot.1", component: "BotBrain", data: initialTuning.BotBrain },
      { kind: "component.set", entityId: "bot.1", component: "BomberStats", data: initialTuning.BomberStats },
      { kind: "component.set", entityId: "bot.1", component: "GridMover", data: initialTuning.GridMover },
      // S87 KABOOM-PLAYER-VS-BOT-COLOR. Force tints so the in-world
      // bombers match the minimap colours from the start.
      { kind: "component.set", entityId: "player.1", component: "MeshRenderer", data: { mesh: "sphere", color: "#5fa8ff" } },
      { kind: "component.set", entityId: "bot.1", component: "MeshRenderer", data: { mesh: "sphere", color: "#ff5a6e" } }
    ]);
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
      audioFx.play(kind);
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
      runtime.applyCommands([
        { kind: "component.set", entityId: "bot.1", component: "BotBrain", data: tuning.BotBrain },
        { kind: "component.set", entityId: "bot.1", component: "BomberStats", data: tuning.BomberStats },
        { kind: "component.set", entityId: "bot.1", component: "GridMover", data: tuning.GridMover }
      ]);
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
        return { round, players, bombs, tiles, pickups };
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
      hud.add({
        id: TITLE_ID,
        slot: "center" as const,
        initial: { text: "Kaboom Crew\nPress SPACE to start" },
        render: (data: { text: string }): HTMLElement => {
          const el = document.createElement("div");
          el.setAttribute("style", "font-size:24px;font-weight:600;text-align:center;padding:6px 12px;white-space:pre-line;");
          el.textContent = data.text;
          return el;
        }
      });
      titleScreenMounted = true;

      // S85 KABOOM-CONTROLS-HINT spec — mounted in the center slot
      // for the first 4 s of the first round, dismissed once the
      // banner needs the slot or the 4 s window expires.
      const CONTROLS_HINT_ID = "kaboom.controls-hint";
      const controlsHintSpec = {
        id: CONTROLS_HINT_ID,
        slot: "center" as const,
        initial: undefined,
        render: (): HTMLElement => {
          const el = document.createElement("div");
          el.setAttribute("style", "font-size:14px;font-weight:500;text-align:center;padding:4px 10px;opacity:0.85;");
          el.textContent = "WASD / arrows  ·  Space = bomb  ·  R = restart";
          return el;
        }
      };
      let controlsHintMounted = false;

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

      const colorFor = (id: string): string =>
        id === "player.1" ? "#5fa8ff" : id === "bot.1" ? "#ff7a36" : "#ffffff";

      let bannerMounted = false;

      const update = (): void => {
        // S84 KABOOM-TITLE-SCREEN — drop the overlay once Space flips gameStarted.
        if (titleScreenMounted && gameStarted) {
          hud.remove(TITLE_ID);
          titleScreenMounted = false;
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
          players: ReadonlyArray<{ id: string; gx?: number; gz?: number; alive?: boolean; maxBombs?: number; range?: number; activeBombs?: number }>;
          bombs: ReadonlyArray<{ id: string; gx?: number; gz?: number }>;
          pickups: ReadonlyArray<{ id: string; gx?: number; gz?: number; kind?: string }>;
        };
        // Stats line — one row per bomber + a persistent score line.
        const lines: string[] = [];
        const phase = s.round?.phase ?? "playing";
        const elapsed = Math.floor(s.round?.elapsed ?? 0);
        const roundNumber = s.round?.roundNumber ?? 1;
        const tally = s.round?.tally ?? { player: 0, bot: 0, draws: 0 };
        lines.push(`Round ${roundNumber}   W:${tally.player} L:${tally.bot} D:${tally.draws}`);
        const timeLimit = s.round?.timeLimit;
        const timeStr = timeLimit !== undefined && timeLimit > 0 ? `t: ${elapsed}s / ${Math.floor(timeLimit)}s` : `t: ${elapsed}s`;
        lines.push(`phase: ${phase}   ${timeStr}`);
        for (const p of s.players) {
          const dead = p.alive === false ? " ✗" : "";
          lines.push(
            `${p.id}${dead}   bombs ${p.activeBombs ?? 0}/${p.maxBombs ?? 1}   fire ${p.range ?? 2}`
          );
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
        } else if (controlsHintMounted && (!hintWindowOpen || bannerMounted)) {
          hud.remove(CONTROLS_HINT_ID);
          controlsHintMounted = false;
        }

        // Banner — empty while playing, mounted otherwise.
        // S87 KABOOM-MATCH-BEST-OF-5 — once the match resolves
        // (matchPhase != in-progress) the banner takes over with the
        // match outcome + a hint that R starts a new match. Auto-
        // restart is suppressed in this state by RoundResolveSystem.
        let bannerText = "";
        const matchPhase = s.round?.matchPhase;
        const matchTarget = s.round?.matchTarget ?? 3;
        const matchOver = matchPhase !== undefined && matchPhase !== "in-progress";
        if (matchOver) {
          if (matchPhase === "won") bannerText = `MATCH WIN — first to ${matchTarget}\nPress R for a new match`;
          else if (matchPhase === "lost") bannerText = `MATCH LOST — bot reached ${matchTarget}\nPress R for a new match`;
          else if (matchPhase === "draw") bannerText = `MATCH DRAW — both reached ${matchTarget}\nPress R for a new match`;
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
  }
};
