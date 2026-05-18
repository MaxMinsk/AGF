// S82 KABOOM-DAMAGE-AND-DEATH (RoundResolveSystem) + KABOOM-RESTART tests.

import { describe, expect, it, vi } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomRoundResolveSystem } from "../../src/systems/round-resolve-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomber(world: World, id: string, alive = true): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, activeBombs: 0, alive });
}

function roundPhase(world: World): string {
  const state = world.getComponent("kaboom.round-state", "RoundState") as { phase: string } | undefined;
  return state?.phase ?? "missing";
}

describe("createKaboomRoundResolveSystem (S82 KABOOM-DAMAGE-AND-DEATH / RESTART)", () => {
  it("creates the RoundState singleton on first tick", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomber(world, "bot.1");
    const system = createKaboomRoundResolveSystem();
    system.frameUpdate!(ctx(world));
    expect(world.hasEntity("kaboom.round-state")).toBe(true);
    expect(roundPhase(world)).toBe("playing");
  });

  it("flips phase to 'won' when only the player remains alive", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomber(world, "bot.1", false);
    const system = createKaboomRoundResolveSystem({ playerId: "player.1" });
    system.frameUpdate!(ctx(world));
    expect(roundPhase(world)).toBe("won");
    const state = world.getComponent("kaboom.round-state", "RoundState") as { winnerId?: string };
    expect(state.winnerId).toBe("player.1");
  });

  it("flips phase to 'lost' when only the bot remains alive", () => {
    const world = new World();
    addBomber(world, "player.1", false);
    addBomber(world, "bot.1");
    const system = createKaboomRoundResolveSystem({ playerId: "player.1" });
    system.frameUpdate!(ctx(world));
    expect(roundPhase(world)).toBe("lost");
  });

  it("flips phase to 'draw' when both die in the same step", () => {
    const world = new World();
    addBomber(world, "player.1", false);
    addBomber(world, "bot.1", false);
    const system = createKaboomRoundResolveSystem();
    system.frameUpdate!(ctx(world));
    expect(roundPhase(world)).toBe("draw");
  });

  it("freezes GridMover.queuedDirection once the round ends", () => {
    const world = new World();
    addBomber(world, "player.1");
    world.setComponent("player.1", "GridMover", { speed: 4, queuedDirection: { dx: 1, dz: 0 }, currentLerp: 0 });
    // Only one bomber alive → already a 'won' situation.
    const system = createKaboomRoundResolveSystem({ playerId: "player.1" });
    system.frameUpdate!(ctx(world));
    // Next tick: phase != 'playing' so GridMover queuedDirection gets zeroed.
    system.frameUpdate!(ctx(world));
    const mover = world.getComponent("player.1", "GridMover") as { queuedDirection: { dx: number; dz: number } };
    expect(mover.queuedDirection).toEqual({ dx: 0, dz: 0 });
  });

  it("RoundRestartRequest triggers onRestart only after the round has ended", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomber(world, "bot.1");
    world.addEntity("control");
    world.setComponent("control", "RoundRestartRequest", {});
    const onRestart = vi.fn();
    const system = createKaboomRoundResolveSystem({ onRestart });
    // Round is still playing → onRestart is NOT invoked; request is consumed.
    system.frameUpdate!(ctx(world));
    expect(onRestart).not.toHaveBeenCalled();
    expect(world.hasComponent("control", "RoundRestartRequest")).toBe(false);

    // Kill the bot to end the round.
    world.setComponent("bot.1", "BomberStats", { maxBombs: 1, range: 2, alive: false });
    system.frameUpdate!(ctx(world));
    expect(roundPhase(world)).toBe("won");

    // Now request restart again — onRestart fires.
    world.setComponent("control", "RoundRestartRequest", {});
    system.frameUpdate!(ctx(world));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("auto-fires onRestart after autoRestartAfterMs of non-playing time", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomber(world, "bot.1", false); // bot starts dead → round will flip to 'won'
    const onRestart = vi.fn();
    const system = createKaboomRoundResolveSystem({
      playerId: "player.1",
      onRestart,
      autoRestartAfterMs: 100
    });

    // Frame 1 — RoundState created and round flips to 'won' (only player alive).
    system.frameUpdate!(ctx(world, 0.05));
    expect(roundPhase(world)).toBe("won");
    expect(onRestart).not.toHaveBeenCalled();

    // Frame 2 — 50 ms elapsed in non-playing; threshold not reached.
    system.frameUpdate!(ctx(world, 0.05));
    expect(onRestart).not.toHaveBeenCalled();

    // Frame 3 — 100 ms elapsed → auto-restart fires once.
    system.frameUpdate!(ctx(world, 0.05));
    expect(onRestart).toHaveBeenCalledTimes(1);

    // Subsequent frames must not re-fire while the same world stays around.
    system.frameUpdate!(ctx(world, 0.05));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("autoRestartAfterMs = 0 disables auto-restart", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomber(world, "bot.1", false);
    const onRestart = vi.fn();
    const system = createKaboomRoundResolveSystem({
      playerId: "player.1",
      onRestart,
      autoRestartAfterMs: 0
    });
    for (let i = 0; i < 10; i += 1) system.frameUpdate!(ctx(world, 1));
    expect(roundPhase(world)).toBe("won");
    expect(onRestart).not.toHaveBeenCalled();
  });
});
