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
function readMapName(): "start" | "wide" {
  const search = (globalThis as unknown as { location?: { search?: string } }).location?.search;
  if (search === undefined || search.length === 0) return "start";
  try {
    const value = new URLSearchParams(search).get("map");
    if (value === "wide") return "wide";
    return "start";
  } catch {
    return "start";
  }
}

function buildFlatStartScene(): SceneInput {
  const map = readMapName();
  const source = (map === "wide" ? wideSceneJson : startSceneJson) as unknown as SceneInput;
  const expansion = expandScenePrefabs(source, PROJECT_PREFABS);
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
  const snap = runtime.snapshot();
  const prevRound = snap.entities.find((e) => e.id === "kaboom.round-state");
  const prev = prevRound?.components["RoundState"] as
    | { roundNumber?: number; tally?: { player: number; bot: number; draws: number } }
    | undefined;
  const nextRoundNumber = (prev?.roundNumber ?? 1) + 1;
  const tally = prev?.tally ?? { player: 0, bot: 0, draws: 0 };
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
        RoundState: { phase: "playing", elapsed: 0, roundNumber: nextRoundNumber, tally, timeLimit: readRoundTimeLimit() }
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
    scheduler.register(occupancy, { profiles: ["static"] });

    scheduler.register(createGridMovementSystem({ occupancy }), { profiles: ["static"] });
    scheduler.register(createKaboomPlayerInputSystem(), { profiles: ["static"] });

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
    _boundRestart = (): void => {
      restartScene(runtime);
    };

    // S85 AGF-POOL-WARMUP-PARTICLES. The first KABOOM-BLAST-PARTICLES
    // burst stalled visibly because the renderer compiles the
    // ParticleEmitter shader program lazily on the first emit + uploads
    // an InstancedMesh + IcosahedronGeometry pair to the GPU. Spawn a
    // single-particle, short-lived 'spark' emitter offscreen during
    // attachUi so the shader is compiled + the pool is hot well before
    // a real blast.
    runtime.applyCommands([
      {
        kind: "entity.create",
        entityId: "kaboom.warmup-particles",
        components: {
          Transform: { position: [-100, -100, -100], rotation: [0, 0, 0], scale: [1, 1, 1] },
          ParticleEmitter: {
            preset: "spark",
            lifetime: 0.05,
            elapsed: 0,
            rate: 60,
            maxParticles: 12
          }
        }
      }
    ]);

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
        initial: { lines: ["Kaboom Crew"] },
        // Build a node so per-line `<div>`s render as actual line
        // breaks (HUD's string path uses textContent, which collapses
        // \n into a single line under the default white-space rules).
        render: (data: { lines: ReadonlyArray<string> }): HTMLElement => {
          const el = document.createElement("div");
          el.setAttribute("style", "display:flex;flex-direction:column;gap:2px;");
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
        hud.update(STATS_ID, { lines });

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
        let bannerText = "";
        if (phase === "won") bannerText = "YOU WIN — restart in 3 s (R)";
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
        hud.update(MINIMAP_ID, { markers });

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
      };
    }

    return {
      dispose(): void {
        window.removeEventListener("keydown", handleKey);
        if (w.__agf !== undefined) delete w.__agf.kaboom;
        _boundRestart = undefined;
        _boundAudioEvent = undefined;
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
