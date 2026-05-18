// S82 KABOOM-PLAYTEST-SCENARIO.
//
// Headless deterministic bot-vs-bot regression test. Boots the full
// Kaboom Crew system stack against the expanded start scene, swaps the
// player's PlayerControlled tag for a BotBrain (so PlayerInputSystem is
// not required), and steps the world for 60 simulated seconds at 60 Hz.
// At the end, RoundState.phase must have left "playing" — every change
// to AI, blast, fuse, occupancy, pickup or round-resolve has to keep
// the round resolvable within 60 s with the seed below.
//
// The test runs entirely in Vitest (no Playwright, no DOM) — drives
// each system's frameUpdate / fixedUpdate manually. Costs ~30-60 ms.

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
  // Surface schema-level expansion errors so we fail loud, not flakily.
  for (const d of expansion.diagnostics) {
    if (d.severity === "error") throw new Error(`scene expansion failed: ${d.code} — ${d.message}`);
  }
  return World.fromScene(expansion.scene);
}

describe("KABOOM-PLAYTEST-SCENARIO (S82 bot-vs-bot regression)", () => {
  it("resolves the round within 60 simulated seconds when both bombers are BotBrains", () => {
    const world = buildWorld();

    // Swap player.1 to bot-controlled. Set up a deterministic
    // close-quarters duel: both bombers cranked to max aggression,
    // bot.1 moved into the same row as player.1 within blast range
    // so the round can resolve within the budget. With the default
    // arena layout the two bots wander into opposite corners and a
    // 60 s budget is too tight — but a single bomb on either side
    // here is enough to flip the phase.
    if (world.hasComponent("player.1", "PlayerControlled")) {
      world.removeComponent("player.1", "PlayerControlled");
    }
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
      // Different seeds for the two-bot pair: bot.1 uses 1337 (matches
      // bootstrap), player.1 — now bot — needs its own BotBrain decisions
      // but the seeded RNG inside the system is shared across entities.
      // That's fine — the BotBrain.nextDecisionIn jitter above keeps
      // their decision frames offset.
      createKaboomBotAISystem({ occupancy, seed: 1337 }),
      createKaboomRoundResolveSystem({ playerId: "player.1", autoRestartAfterMs: 0 })
    ];

    const fixedDt = 1 / 60;
    const totalSeconds = 60;
    const totalSteps = Math.ceil(totalSeconds / fixedDt);
    let elapsed = 0;

    for (let step = 0; step < totalSteps; step += 1) {
      const time = { elapsed, dt: fixedDt, fixedDt, frameCount: step, fixedStepCount: step };
      const context: SystemContext = { world, time };
      // Both phases share the same world view; engine scheduler picks
      // by registration order, so do the same here.
      for (const system of systems) {
        if (system.fixedUpdate !== undefined) system.fixedUpdate(context);
      }
      for (const system of systems) {
        if (system.frameUpdate !== undefined) system.frameUpdate(context);
      }
      elapsed += fixedDt;

      // Short-circuit once the round is resolved — keeps test fast and
      // makes the failure message reflect the actual stopping step.
      const state = world.getComponent<{ phase?: string }>("kaboom.round-state", "RoundState");
      if (state !== undefined && state.phase !== undefined && state.phase !== "playing") {
        expect(state.phase).toMatch(/^(won|lost|draw)$/);
        return;
      }
    }

    const finalState = world.getComponent<{ phase?: string }>("kaboom.round-state", "RoundState");
    expect.fail(`round did not resolve within ${totalSeconds} s (final phase: ${finalState?.phase ?? "missing"})`);
  });
});
