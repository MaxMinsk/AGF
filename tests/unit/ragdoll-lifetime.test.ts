// S136 — engine ragdoll lifetime-system unit tests.
//
// Pure ECS, no Rapier — the lifetime-system only reads/writes
// RagdollLifetime + RagdollTeardownRequest components.

import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import type { SystemContext } from "../../engine/core/systems/types";
import { createRagdollLifetimeSystem } from "../../engine/physics/ragdoll/lifetime-system";

const FIXED_DT = 1 / 60;

function ctx(world: World, frameCount = 0): SystemContext {
  return {
    world,
    time: {
      elapsed: frameCount * FIXED_DT,
      dt: FIXED_DT,
      fixedDt: FIXED_DT,
      frameCount,
      fixedStepCount: frameCount
    }
  } as SystemContext;
}

describe("createRagdollLifetimeSystem (S136)", () => {
  it("decrements RagdollLifetime.secondsRemaining by fixedDt each tick", () => {
    const world = new World();
    world.addEntity("bot.1");
    world.setComponent("bot.1", "RagdollLifetime", { secondsRemaining: 1.0 });
    const sys = createRagdollLifetimeSystem();
    sys.fixedUpdate!(ctx(world, 0));
    const lt = world.getComponent<{ secondsRemaining: number }>("bot.1", "RagdollLifetime")!;
    expect(lt.secondsRemaining).toBeCloseTo(1.0 - FIXED_DT, 6);
    expect(world.hasComponent("bot.1", "RagdollTeardownRequest")).toBe(false);
  });

  it("issues RagdollTeardownRequest exactly when secondsRemaining hits zero", () => {
    const world = new World();
    world.addEntity("bot.1");
    // 60 ticks at dt=1/60 takes us from 1.0 to 0 exactly.
    world.setComponent("bot.1", "RagdollLifetime", { secondsRemaining: 1.0 });
    const sys = createRagdollLifetimeSystem();
    let triggered = -1;
    for (let i = 0; i < 80; i += 1) {
      sys.fixedUpdate!(ctx(world, i));
      if (triggered === -1 && world.hasComponent("bot.1", "RagdollTeardownRequest")) {
        triggered = i;
      }
    }
    expect(triggered).toBeGreaterThanOrEqual(59);
    expect(triggered).toBeLessThanOrEqual(60);
  });

  it("is idempotent — does not re-issue RagdollTeardownRequest after it's already set", () => {
    const world = new World();
    world.addEntity("bot.1");
    world.setComponent("bot.1", "RagdollLifetime", { secondsRemaining: FIXED_DT * 0.1 });
    const sys = createRagdollLifetimeSystem();
    // Tick 1: counter goes negative, request set.
    sys.fixedUpdate!(ctx(world, 0));
    expect(world.hasComponent("bot.1", "RagdollTeardownRequest")).toBe(true);
    // Mark the request with a sentinel; if the system over-writes it
    // we'll see the sentinel get clobbered.
    world.setComponent("bot.1", "RagdollTeardownRequest", { sentinel: "keep" });
    sys.fixedUpdate!(ctx(world, 1));
    const req = world.getComponent<{ sentinel?: string }>("bot.1", "RagdollTeardownRequest");
    expect(req?.sentinel).toBe("keep");
  });

  it("ignores entities without RagdollLifetime — no spurious teardown requests", () => {
    const world = new World();
    world.addEntity("bot.alive");
    world.setComponent("bot.alive", "RagdollActive", {});
    const sys = createRagdollLifetimeSystem();
    sys.fixedUpdate!(ctx(world, 0));
    expect(world.hasComponent("bot.alive", "RagdollTeardownRequest")).toBe(false);
  });

  it("processes multiple roots independently in the same tick", () => {
    const world = new World();
    world.addEntity("a");
    world.addEntity("b");
    world.setComponent("a", "RagdollLifetime", { secondsRemaining: FIXED_DT * 0.5 });
    world.setComponent("b", "RagdollLifetime", { secondsRemaining: 2.0 });
    const sys = createRagdollLifetimeSystem();
    sys.fixedUpdate!(ctx(world, 0));
    expect(world.hasComponent("a", "RagdollTeardownRequest")).toBe(true);
    expect(world.hasComponent("b", "RagdollTeardownRequest")).toBe(false);
    const ltB = world.getComponent<{ secondsRemaining: number }>("b", "RagdollLifetime")!;
    expect(ltB.secondsRemaining).toBeCloseTo(2.0 - FIXED_DT, 6);
  });
});
