import { describe, expect, it } from "vitest";
import { createRoundSystem } from "../../src/systems/round-system";
import { World } from "../../../../engine/core/ecs/world";
import type { TimeContext } from "../../../../engine/core/loop/types";

type RoundState = {
  phase: "active" | "complete";
  thresholdHealth: number;
  holdSeconds: number;
  holdProgress?: number;
  completedAt?: number;
};

function step(world: World, dt: number, elapsed: number): void {
  const system = createRoundSystem();
  const time: TimeContext = {
    elapsed,
    dt,
    fixedDt: 1 / 60,
    frameCount: 0,
    fixedStepCount: 0
  };
  system.frameUpdate?.({ time, world });
}

function buildWorld(health: number, round: Partial<RoundState> = {}): World {
  const world = new World();
  world.addEntity("world.signal");
  world.setComponent("world.signal", "WorldSignal", { health, target: health, tau: 2 });
  world.setComponent("world.signal", "RoundState", {
    phase: "active",
    thresholdHealth: 0.85,
    holdSeconds: 1,
    holdProgress: 0,
    ...round
  });
  return world;
}

describe("RoundSystem", () => {
  it("accumulates holdProgress while health >= threshold", () => {
    const world = buildWorld(0.9);
    step(world, 0.2, 0.2);
    const round = world.getComponent<RoundState>("world.signal", "RoundState");
    expect(round?.holdProgress).toBeCloseTo(0.2, 5);
    expect(round?.phase).toBe("active");
  });

  it("flips to complete and stamps completedAt when holdProgress reaches holdSeconds", () => {
    const world = buildWorld(0.9);
    let elapsed = 0;
    for (let i = 0; i < 30; i += 1) {
      elapsed += 0.1;
      step(world, 0.1, elapsed);
    }
    const round = world.getComponent<RoundState>("world.signal", "RoundState");
    expect(round?.phase).toBe("complete");
    expect(round?.holdProgress).toBeCloseTo(1.0, 5);
    expect(round?.completedAt).toBeGreaterThan(0);
  });

  it("resets holdProgress when health drops below threshold", () => {
    const world = buildWorld(0.9, { holdProgress: 0.4 });
    world.setComponent("world.signal", "WorldSignal", { health: 0.3, target: 0.3, tau: 2 });
    step(world, 0.1, 0.5);
    const round = world.getComponent<RoundState>("world.signal", "RoundState");
    expect(round?.holdProgress).toBe(0);
    expect(round?.phase).toBe("active");
  });

  it("does not regress phase once complete", () => {
    const world = buildWorld(0.9, { phase: "complete", holdProgress: 1.0, completedAt: 5 });
    world.setComponent("world.signal", "WorldSignal", { health: 0, target: 0, tau: 2 });
    step(world, 1.0, 10);
    const round = world.getComponent<RoundState>("world.signal", "RoundState");
    expect(round?.phase).toBe("complete");
    expect(round?.completedAt).toBe(5);
  });

  it("is a no-op when the world.signal entity is absent", () => {
    const world = new World();
    expect(() => step(world, 0.1, 0)).not.toThrow();
  });
});
