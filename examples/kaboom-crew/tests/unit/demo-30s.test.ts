// S84 KABOOM-DEMO-RECORDING.
//
// Deterministic 30-second bot-vs-bot fixture used as the regression
// gate for the gameplay surface. Boots the start scene, swaps
// player.1 for a second BotBrain, ticks the full system stack for
// 30 simulated seconds at 60 Hz, and snapshots a compact summary:
//
//   { phase, tally, finalPositions: { id, gx, gz, alive } }
//
// Vitest's toMatchSnapshot stores the expected output under
// `examples/kaboom-crew/tests/unit/__snapshots__/demo-30s.test.ts.snap`.
// Any AI / blast / fuse / pickup / round-resolve change that breaks
// determinism flips the snapshot diff red — re-run with the
// `--update` flag (after eyeballing the new output) to refresh.
//
// Differs from bot-vs-bot.test.ts (the S082 playtest) by:
//   - shorter horizon (30 s vs 60 s),
//   - close-quarters setup tuned to flip phase fast,
//   - hashed final-state snapshot instead of a phase-only assertion.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { expandScenePrefabs, type PrefabDefinition } from "../../../../engine/core/scene/expand-prefabs";
import type { SceneInput } from "../../../../engine/core/ecs/types";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import startSceneJson from "../../scenes/start.scene.json";
import playerPrefab from "../../prefabs/player.prefab.json";
import botPrefab from "../../prefabs/bot.prefab.json";
import softBlockPrefab from "../../prefabs/soft-block.prefab.json";
import hardBlockPrefab from "../../prefabs/hard-block.prefab.json";
import bombPrefab from "../../prefabs/bomb.prefab.json";

import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { createGridMovementSystem } from "../../../../engine/core/systems/grid-movement-system";
import { createKaboomBombPlacementSystem } from "../../src/systems/bomb-placement-system";
import { createKaboomBombFuseSystem } from "../../src/systems/bomb-fuse-system";
import { createKaboomBlastPropagationSystem } from "../../src/systems/blast-propagation-system";
import { createKaboomBlastTileLifetimeSystem } from "../../src/systems/blast-tile-lifetime-system";
import { createKaboomPickupSpawnSystem } from "../../src/systems/pickup-spawn-system";
import { createKaboomPickupCollectSystem } from "../../src/systems/pickup-collect-system";
import { createKaboomBotAISystem } from "../../src/systems/bot-ai-system";
import { createKaboomRoundResolveSystem } from "../../src/systems/round-resolve-system";

function buildWorld(): World {
  const registry: ReadonlyMap<string, PrefabDefinition> = new Map<string, PrefabDefinition>([
    [playerPrefab.id, playerPrefab as PrefabDefinition],
    [botPrefab.id, botPrefab as PrefabDefinition],
    [softBlockPrefab.id, softBlockPrefab as PrefabDefinition],
    [hardBlockPrefab.id, hardBlockPrefab as PrefabDefinition],
    [bombPrefab.id, bombPrefab as PrefabDefinition]
  ]);
  const expansion = expandScenePrefabs(startSceneJson as unknown as SceneInput, registry);
  for (const d of expansion.diagnostics) {
    if (d.severity === "error") throw new Error(`scene expansion failed: ${d.code} — ${d.message}`);
  }
  return World.fromScene(expansion.scene);
}

describe("Kaboom Crew demo-30s regression (S84 KABOOM-DEMO-RECORDING)", () => {
  it("produces a stable final state for a deterministic 30 s bot-vs-bot round", () => {
    const world = buildWorld();

    if (world.hasComponent("player.1", "PlayerControlled")) {
      world.removeComponent("player.1", "PlayerControlled");
    }
    // Close-quarters duel matched to the S082 playtest so the round
    // resolves within the 30 s budget.
    world.setComponent("player.1", "BotBrain", { aggression: 1, nextDecisionIn: 0 });
    world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 4, activeBombs: 0, alive: true });
    world.setComponent("bot.1", "GridPosition", { gx: 3, gz: 1 });
    world.setComponent("bot.1", "Transform", { position: [3, 0.4, 1], rotation: [0, 0, 0], scale: [0.4, 0.4, 0.4] });
    world.setComponent("bot.1", "BotBrain", { aggression: 1, nextDecisionIn: 0.05 });
    world.setComponent("bot.1", "BomberStats", { maxBombs: 1, range: 4, activeBombs: 0, alive: true });

    const occupancy = createGridOccupancySystem();
    const systems: System[] = [
      occupancy,
      createGridMovementSystem({ occupancy }),
      createKaboomBombPlacementSystem({ occupancy }),
      createKaboomBombFuseSystem(),
      createKaboomBlastPropagationSystem({ occupancy }),
      createKaboomBlastTileLifetimeSystem({ occupancy }),
      createKaboomPickupSpawnSystem({ seed: 0xc0ffee }),
      createKaboomPickupCollectSystem({ occupancy }),
      createKaboomBotAISystem({ occupancy, seed: 1337 }),
      createKaboomRoundResolveSystem({ playerId: "player.1", autoRestartAfterMs: 0 })
    ];

    const fixedDt = 1 / 60;
    const totalSteps = Math.ceil(30 / fixedDt);
    let elapsed = 0;
    let stoppedAtStep: number | undefined;
    for (let step = 0; step < totalSteps; step += 1) {
      const time = { elapsed, dt: fixedDt, fixedDt, frameCount: step, fixedStepCount: step };
      const context: SystemContext = { world, time };
      for (const system of systems) if (system.fixedUpdate !== undefined) system.fixedUpdate(context);
      for (const system of systems) if (system.frameUpdate !== undefined) system.frameUpdate(context);
      elapsed += fixedDt;
      const state = world.getComponent<{ phase?: string }>("kaboom.round-state", "RoundState");
      if (state !== undefined && state.phase !== undefined && state.phase !== "playing") {
        stoppedAtStep = step;
        break;
      }
    }

    const round = world.getComponent<{
      phase?: string;
      tally?: { player: number; bot: number; draws: number };
    }>("kaboom.round-state", "RoundState");
    const summary = {
      phase: round?.phase,
      tally: round?.tally,
      stoppedAtStep,
      bombers: ["player.1", "bot.1"].map((id) => {
        const pos = world.getComponent<{ gx: number; gz: number }>(id, "GridPosition");
        const stats = world.getComponent<{ alive?: boolean }>(id, "BomberStats");
        return { id, gx: pos?.gx ?? -1, gz: pos?.gz ?? -1, alive: stats?.alive !== false };
      })
    };

    expect(summary).toMatchSnapshot();
  });
});
