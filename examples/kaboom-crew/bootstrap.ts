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

    return {
      dispose(): void {
        window.removeEventListener("keydown", handleKey);
        if (w.__agf !== undefined) delete w.__agf.kaboom;
        _boundRestart = undefined;
      }
    };
  },

  resetRound(runtime: RuntimeHandle): number {
    return restartScene(runtime);
  }
};
