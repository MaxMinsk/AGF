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

function buildFlatStartScene(): SceneInput {
  const expansion = expandScenePrefabs(startSceneJson as unknown as SceneInput, PROJECT_PREFABS);
  if (expansion.diagnostics.length > 0) {
    // eslint-disable-next-line no-console
    console.warn("[kaboom-crew] restart: scene expansion produced diagnostics", expansion.diagnostics);
  }
  return expansion.scene;
}

function restartScene(runtime: RuntimeHandle): number {
  runtime.applyCommands([{ kind: "scene.load", scene: buildFlatStartScene() }]);
  return 1;
}

// Late-bound restart callback. registerSystems runs before attachUi, so
// the runtime handle isn't available when RoundResolveSystem is built —
// the system holds this closure and attachUi populates `_boundRestart`
// once the runtime is known. Cleared in dispose to release the handle.
let _boundRestart: (() => void) | undefined;

export const kaboomCrewBootstrap: ProjectBootstrap = {
  registerSystems({ scheduler }: ProjectBootstrapContext): void {
    const occupancy = createGridOccupancySystem();
    scheduler.register(occupancy, { profiles: ["static"] });

    scheduler.register(createGridMovementSystem({ occupancy }), { profiles: ["static"] });
    scheduler.register(createKaboomPlayerInputSystem(), { profiles: ["static"] });

    // Bomb pipeline.
    scheduler.register(createKaboomBombPlacementSystem({ occupancy }), { profiles: ["static"] });
    scheduler.register(createKaboomBombFuseSystem(), { profiles: ["static"] });
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

    const handleKey = (event: KeyboardEvent): void => {
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

      hud.add({
        id: STATS_ID,
        slot: "topLeft",
        initial: { lines: ["Kaboom Crew"] },
        render: (data: { lines: ReadonlyArray<string> }): string => data.lines.join("\n")
      });
      hud.add({
        id: BANNER_ID,
        slot: "center",
        initial: { text: "" },
        render: (data: { text: string }): string => data.text
      });
      // Arena bounds are 15 × 11 cells with cellSize 1, origin at (0,0).
      // Mirror the engine grid layout — same convention the world uses.
      // Pass `initial` so HUD's first render call doesn't dereference
      // an undefined `data.markers` (minimap.paint expects MinimapData).
      const minimapSpec = createMinimapWidget({
        id: MINIMAP_ID,
        slot: "topRight",
        bounds: { minX: -0.5, maxX: 14.5, minZ: -0.5, maxZ: 10.5 },
        pixelSize: 160
      });
      hud.add({ ...minimapSpec, initial: { markers: [] } } as unknown);

      const colorFor = (id: string): string =>
        id === "player.1" ? "#5fa8ff" : id === "bot.1" ? "#ff7a36" : "#ffffff";

      const update = (): void => {
        const s = api.status() as {
          round?: { phase?: string; elapsed?: number; winnerId?: string };
          players: ReadonlyArray<{ id: string; gx?: number; gz?: number; alive?: boolean; maxBombs?: number; range?: number; activeBombs?: number }>;
          bombs: ReadonlyArray<{ id: string; gx?: number; gz?: number }>;
          pickups: ReadonlyArray<{ id: string; gx?: number; gz?: number; kind?: string }>;
        };
        // Stats line — one row per bomber.
        const lines: string[] = [];
        const phase = s.round?.phase ?? "playing";
        const elapsed = Math.floor(s.round?.elapsed ?? 0);
        lines.push(`round: ${phase}   t: ${elapsed}s`);
        for (const p of s.players) {
          const dead = p.alive === false ? " ✗" : "";
          lines.push(
            `${p.id}${dead}   bombs ${p.activeBombs ?? 0}/${p.maxBombs ?? 1}   fire ${p.range ?? 2}`
          );
        }
        hud.update(STATS_ID, { lines });

        // Banner — empty while playing, message otherwise.
        let bannerText = "";
        if (phase === "won") bannerText = "YOU WIN — restart in 3 s (R)";
        else if (phase === "lost") bannerText = "YOU LOST — restart in 3 s (R)";
        else if (phase === "draw") bannerText = "DRAW — restart in 3 s (R)";
        hud.update(BANNER_ID, { text: bannerText });

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
        hud.remove(BANNER_ID);
        hud.remove(MINIMAP_ID);
      };
    }

    return {
      dispose(): void {
        window.removeEventListener("keydown", handleKey);
        if (w.__agf !== undefined) delete w.__agf.kaboom;
        _boundRestart = undefined;
        if (hudCleanup !== undefined) hudCleanup();
      }
    };
  },

  resetRound(runtime: RuntimeHandle): number {
    return restartScene(runtime);
  }
};
