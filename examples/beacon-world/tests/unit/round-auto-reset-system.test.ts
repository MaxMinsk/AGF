import { describe, expect, it } from "vitest";
import { createRoundAutoResetSystem } from "../../src/systems/round-auto-reset-system";
import { World } from "../../../../engine/core/ecs/world";
import type { TimeContext } from "../../../../engine/core/loop/types";

function step(world: World, elapsed: number, dt: number = 1 / 60): void {
  const system = createRoundAutoResetSystem();
  const time: TimeContext = {
    elapsed,
    dt,
    fixedDt: 1 / 60,
    frameCount: 0,
    fixedStepCount: 0
  };
  system.frameUpdate?.({ time, world });
}

function buildWorld(opts: { phase: "active" | "complete"; autoResetSeconds?: number; completedAt?: number }): World {
  const world = new World();
  world.addEntity("world.signal");
  world.setComponent("world.signal", "WorldSignal", { health: 0.9, target: 0.9, tau: 2 });
  const round: Record<string, unknown> = {
    phase: opts.phase,
    thresholdHealth: 0.85,
    holdSeconds: 3,
    holdProgress: opts.phase === "complete" ? 3 : 0
  };
  if (opts.autoResetSeconds !== undefined) {
    round["autoResetSeconds"] = opts.autoResetSeconds;
  }
  if (opts.completedAt !== undefined) {
    round["completedAt"] = opts.completedAt;
  }
  world.setComponent("world.signal", "RoundState", round);

  world.addEntity("beacon.west");
  world.setComponent("beacon.west", "Repairable", {
    accepts: "energy-core",
    repaired: true,
    decayIn: 4
  });
  world.setComponent("beacon.west", "MeshRenderer", { mesh: "runtime/models/beacon.glb" });

  return world;
}

describe("RoundAutoResetSystem", () => {
  it("does not reset while phase is still active", () => {
    const world = buildWorld({ phase: "active", autoResetSeconds: 1 });
    step(world, 10);
    const round = world.getComponent<{ phase: string }>("world.signal", "RoundState");
    expect(round?.phase).toBe("active");
    const beacon = world.getComponent<{ repaired?: boolean }>("beacon.west", "Repairable");
    expect(beacon?.repaired).toBe(true);
  });

  it("waits until autoResetSeconds have elapsed after completedAt before resetting", () => {
    const world = buildWorld({ phase: "complete", autoResetSeconds: 2, completedAt: 10 });

    step(world, 11.5);
    let round = world.getComponent<{ phase: string }>("world.signal", "RoundState");
    expect(round?.phase).toBe("complete");
    let beacon = world.getComponent<{ repaired?: boolean }>("beacon.west", "Repairable");
    expect(beacon?.repaired).toBe(true);

    step(world, 12.5);
    round = world.getComponent<{ phase: string; holdProgress?: number }>("world.signal", "RoundState");
    expect(round?.phase).toBe("active");
    beacon = world.getComponent<{ repaired?: boolean }>("beacon.west", "Repairable");
    expect(beacon?.repaired).toBe(false);
  });

  it("is a no-op when autoResetSeconds is omitted", () => {
    const world = buildWorld({ phase: "complete", completedAt: 10 });
    step(world, 1000);
    const round = world.getComponent<{ phase: string }>("world.signal", "RoundState");
    expect(round?.phase).toBe("complete");
    const beacon = world.getComponent<{ repaired?: boolean }>("beacon.west", "Repairable");
    expect(beacon?.repaired).toBe(true);
  });

  it("preserves autoResetSeconds across the reset boundary", () => {
    const world = buildWorld({ phase: "complete", autoResetSeconds: 2, completedAt: 0 });
    step(world, 2.5);
    const round = world.getComponent<{
      phase: string;
      autoResetSeconds?: number;
      holdProgress?: number;
    }>("world.signal", "RoundState");
    expect(round?.phase).toBe("active");
    expect(round?.autoResetSeconds).toBe(2);
    expect(round?.holdProgress).toBe(0);
  });
});
