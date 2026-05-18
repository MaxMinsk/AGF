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

  it("S84 KABOOM-SCORING-HUD: tally.player increments on 'won' phase", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomber(world, "bot.1", false); // already dead → next tick resolves to 'won'
    const system = createKaboomRoundResolveSystem({ playerId: "player.1", autoRestartAfterMs: 0 });
    system.frameUpdate!(ctx(world));
    const state = world.getComponent("kaboom.round-state", "RoundState") as {
      phase: string;
      tally?: { player: number; bot: number; draws: number };
    };
    expect(state.phase).toBe("won");
    expect(state.tally).toEqual({ player: 1, bot: 0, draws: 0 });
  });

  it("S84 KABOOM-SCORING-HUD: tally.bot increments on 'lost' phase", () => {
    const world = new World();
    addBomber(world, "player.1", false);
    addBomber(world, "bot.1");
    const system = createKaboomRoundResolveSystem({ playerId: "player.1", autoRestartAfterMs: 0 });
    system.frameUpdate!(ctx(world));
    const state = world.getComponent("kaboom.round-state", "RoundState") as { phase: string; tally?: { bot: number } };
    expect(state.phase).toBe("lost");
    expect(state.tally?.bot).toBe(1);
  });

  it("S84 KABOOM-SCORING-HUD: tally.draws increments on 'draw' phase", () => {
    const world = new World();
    addBomber(world, "player.1", false);
    addBomber(world, "bot.1", false);
    const system = createKaboomRoundResolveSystem({ playerId: "player.1", autoRestartAfterMs: 0 });
    system.frameUpdate!(ctx(world));
    const state = world.getComponent("kaboom.round-state", "RoundState") as { phase: string; tally?: { draws: number } };
    expect(state.phase).toBe("draw");
    expect(state.tally?.draws).toBe(1);
  });

  it("S85 KABOOM-ROUND-TIMER: timeLimit reached with both alive → 'draw' + tally.draws bump", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomber(world, "bot.1");
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", {
      phase: "playing",
      elapsed: 5,
      tally: { player: 0, bot: 0, draws: 0 },
      timeLimit: 5
    });
    const system = createKaboomRoundResolveSystem({ playerId: "player.1", autoRestartAfterMs: 0 });
    system.frameUpdate!(ctx(world, 0.02));
    const state = world.getComponent("kaboom.round-state", "RoundState") as { phase: string; tally?: { draws: number } };
    expect(state.phase).toBe("draw");
    expect(state.tally?.draws).toBe(1);
  });

  it("S85 KABOOM-ROUND-TIMER: timeLimit=0 disables the auto-draw", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomber(world, "bot.1");
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", {
      phase: "playing",
      elapsed: 1000,
      tally: { player: 0, bot: 0, draws: 0 },
      timeLimit: 0
    });
    const system = createKaboomRoundResolveSystem({ playerId: "player.1", autoRestartAfterMs: 0 });
    for (let i = 0; i < 10; i += 1) system.frameUpdate!(ctx(world, 1));
    const state = world.getComponent("kaboom.round-state", "RoundState") as { phase: string };
    expect(state.phase).toBe("playing");
  });

  it("S87 KABOOM-MATCH-BEST-OF-5: matchPhase='in-progress' until tally hits matchTarget", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomber(world, "bot.1", false);
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", {
      phase: "playing",
      elapsed: 0,
      tally: { player: 2, bot: 0, draws: 0 },
      matchTarget: 3,
      matchPhase: "in-progress"
    });
    const system = createKaboomRoundResolveSystem({ playerId: "player.1", autoRestartAfterMs: 0 });
    system.frameUpdate!(ctx(world));
    const state = world.getComponent("kaboom.round-state", "RoundState") as {
      phase: string;
      tally?: { player: number };
      matchPhase?: string;
    };
    expect(state.phase).toBe("won");
    expect(state.tally?.player).toBe(3);
    expect(state.matchPhase).toBe("won");
  });

  it("S87 KABOOM-MATCH-BEST-OF-5: tally.bot reaching matchTarget → matchPhase='lost'", () => {
    const world = new World();
    addBomber(world, "player.1", false);
    addBomber(world, "bot.1");
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", {
      phase: "playing",
      elapsed: 0,
      tally: { player: 0, bot: 2, draws: 0 },
      matchTarget: 3,
      matchPhase: "in-progress"
    });
    const system = createKaboomRoundResolveSystem({ playerId: "player.1", autoRestartAfterMs: 0 });
    system.frameUpdate!(ctx(world));
    const state = world.getComponent("kaboom.round-state", "RoundState") as { matchPhase?: string };
    expect(state.matchPhase).toBe("lost");
  });

  it("S87 KABOOM-MATCH-BEST-OF-5: auto-restart suppressed when matchPhase resolves", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomber(world, "bot.1", false);
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", {
      phase: "playing",
      elapsed: 0,
      tally: { player: 2, bot: 0, draws: 0 },
      matchTarget: 3,
      matchPhase: "in-progress"
    });
    const onRestart = vi.fn();
    const system = createKaboomRoundResolveSystem({
      playerId: "player.1",
      onRestart,
      autoRestartAfterMs: 100
    });
    // Tick 1 — round resolves to 'won', match resolves to 'won'.
    system.frameUpdate!(ctx(world, 0.05));
    const state = world.getComponent("kaboom.round-state", "RoundState") as { matchPhase?: string };
    expect(state.matchPhase).toBe("won");
    // Keep ticking past autoRestartAfterMs — onRestart MUST NOT fire because the match is over.
    for (let i = 0; i < 10; i += 1) system.frameUpdate!(ctx(world, 0.05));
    expect(onRestart).not.toHaveBeenCalled();
  });

  it("S87 KABOOM-MATCH-BEST-OF-5: matchTarget=0 leaves matchPhase='in-progress' (auto-restart still works)", () => {
    const world = new World();
    addBomber(world, "player.1");
    addBomber(world, "bot.1", false);
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", {
      phase: "playing",
      elapsed: 0,
      tally: { player: 9, bot: 0, draws: 0 },
      matchTarget: 0,
      matchPhase: "in-progress"
    });
    const onRestart = vi.fn();
    const system = createKaboomRoundResolveSystem({
      playerId: "player.1",
      onRestart,
      autoRestartAfterMs: 50
    });
    system.frameUpdate!(ctx(world, 0.05));
    const state = world.getComponent("kaboom.round-state", "RoundState") as { matchPhase?: string };
    expect(state.matchPhase).toBe("in-progress");
    // Push past the threshold so auto-restart can fire.
    system.frameUpdate!(ctx(world, 0.05));
    system.frameUpdate!(ctx(world, 0.05));
    expect(onRestart).toHaveBeenCalled();
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
