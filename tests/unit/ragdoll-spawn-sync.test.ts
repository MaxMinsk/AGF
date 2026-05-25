// S128 — ragdoll spawn + sync + teardown integration tests.
// Uses a real Rapier adapter (so the test catches integration bugs)
// + a real ECS World + the three new ragdoll systems.

import { afterEach, describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import type { SystemContext } from "../../engine/core/systems/types";
import { createRapierAdapter, type RapierAdapter } from "../../engine/physics/rapier/rapier-adapter";
import { createRagdollSpawnSystem } from "../../engine/physics/ragdoll/spawn-system";
import { createRagdollSyncSystem } from "../../engine/physics/ragdoll/sync-system";
import { createRagdollTeardownSystem } from "../../engine/physics/ragdoll/teardown-system";
import {
  clearRagdollTemplates,
  registerRagdollTemplate
} from "../../engine/physics/ragdoll/template-registry";

const FIXED_DT = 1 / 60;

async function setup(): Promise<{ world: World; adapter: RapierAdapter; tick: (steps?: number) => void }> {
  const adapter = await createRapierAdapter({ gravity: [0, -9.81, 0], fixedDt: FIXED_DT });
  const world = new World();
  const spawn = createRagdollSpawnSystem({ adapter });
  const sync = createRagdollSyncSystem({ adapter });
  const teardown = createRagdollTeardownSystem({ adapter });
  let stepCount = 0;
  const tick = (steps = 1): void => {
    for (let i = 0; i < steps; i += 1) {
      const ctx: SystemContext = {
        world,
        time: {
          elapsed: stepCount * FIXED_DT,
          dt: FIXED_DT,
          fixedDt: FIXED_DT,
          frameCount: stepCount,
          fixedStepCount: stepCount,
          interpolationAlpha: 0
        }
      } as SystemContext;
      spawn.fixedUpdate?.(ctx);
      adapter.step(FIXED_DT);
      sync.fixedUpdate?.(ctx);
      teardown.fixedUpdate?.(ctx);
      stepCount += 1;
    }
  };
  return { world, adapter, tick };
}

describe("ragdoll spawn → sync → teardown (S128)", () => {
  afterEach(() => clearRagdollTemplates());

  it("1-body template — spawns, falls under gravity, syncs back to ECS Transform.y", async () => {
    registerRagdollTemplate("solo", {
      bodies: [{ name: "torso", shape: "sphere", dimensions: [0.2, 0, 0] }]
    });
    const { world, adapter, tick } = await setup();
    world.addEntity("root.1");
    world.setComponent("root.1", "Transform", { position: [0, 5, 0] });
    world.setComponent("root.1", "RagdollSpawnRequest", { templateKey: "solo" });
    tick();
    expect(world.hasComponent("root.1", "RagdollState")).toBe(true);
    expect(world.hasComponent("root.1", "RagdollActive")).toBe(true);
    const state = world.getComponent<{
      templateKey: string;
      bodyEntities: Record<string, string>;
    }>("root.1", "RagdollState")!;
    expect(state.templateKey).toBe("solo");
    const torsoId = state.bodyEntities["torso"]!;
    const transformBefore = world.getComponent<{ position: number[] }>(torsoId, "Transform")!;
    const yBefore = transformBefore.position[1]!;
    tick(60); // 1 second of gravity
    const transformAfter = world.getComponent<{ position: number[] }>(torsoId, "Transform")!;
    expect(transformAfter.position[1]!).toBeLessThan(yBefore - 1); // dropped at least 1m
    adapter.dispose();
  });

  it("2-body template with fixed joint — bodies move together under impulse", async () => {
    registerRagdollTemplate("pair", {
      bodies: [
        { name: "a", shape: "sphere", dimensions: [0.1, 0, 0], anchor: [0, 0, 0] },
        { name: "b", shape: "sphere", dimensions: [0.1, 0, 0], anchor: [1, 0, 0] }
      ],
      joints: [
        {
          name: "ab",
          bodyA: "a",
          bodyB: "b",
          type: "fixed",
          anchorA: [0.5, 0, 0],
          anchorB: [-0.5, 0, 0]
        }
      ]
    });
    const { world, adapter, tick } = await setup();
    world.addEntity("root.2");
    world.setComponent("root.2", "Transform", { position: [0, 0, 0] });
    world.setComponent("root.2", "RagdollSpawnRequest", { templateKey: "pair", impulse: [5, 0, 0] });
    tick();
    const state = world.getComponent<{ bodyEntities: Record<string, string> }>("root.2", "RagdollState")!;
    const aId = state.bodyEntities["a"]!;
    const bId = state.bodyEntities["b"]!;
    tick(30);
    const aPos = world.getComponent<{ position: number[] }>(aId, "Transform")!.position;
    const bPos = world.getComponent<{ position: number[] }>(bId, "Transform")!.position;
    // Both should have moved on +X (impulse + joint dragging).
    expect(aPos[0]!).toBeGreaterThan(0.05);
    expect(bPos[0]!).toBeGreaterThan(0.05);
    // Distance between them stays ~constant (joint locked).
    const dist = Math.abs(bPos[0]! - aPos[0]!);
    expect(dist).toBeCloseTo(1, 0);
    adapter.dispose();
  });

  it("S135-hotfix — impulse is applied to the first body only (not duplicated per body)", async () => {
    // Pre-hotfix the spawn-system applied the full impulse to every
    // body, so a 10-body bomber template multiplied the requested
    // momentum by 10. After: impulse hits only the first body
    // (root/torso by convention) and joints transmit the motion to
    // the rest on subsequent ticks. This template has NO joints so
    // we can directly observe only body[0] moving on the first step.
    registerRagdollTemplate("ten-free", {
      linearDamping: 0,
      angularDamping: 0,
      bodies: Array.from({ length: 10 }, (_, i) => ({
        name: `b${i}`,
        shape: "sphere" as const,
        dimensions: [0.05, 0, 0] as [number, number, number],
        anchor: [i * 0.5, 0, 0] as [number, number, number]
      }))
    });
    const { world, adapter, tick } = await setup();
    world.addEntity("root.free");
    world.setComponent("root.free", "Transform", { position: [0, 0, 0] });
    world.setComponent("root.free", "RagdollSpawnRequest", {
      templateKey: "ten-free",
      impulse: [1.0, 0, 0]
    });
    tick(); // spawn + one physics step
    const state = world.getComponent<{ bodyEntities: Record<string, string> }>("root.free", "RagdollState")!;
    const body0Pos = world.getComponent<{ position: number[] }>(state.bodyEntities["b0"]!, "Transform")!.position;
    // body[0] picks up the impulse and moves forward on +X.
    expect(body0Pos[0]!).toBeGreaterThan(0.0001);
    // bodies[1..9] have no joints to b0 here, so they should stay
    // essentially at their spawn anchor on the first tick. Pre-hotfix
    // they would each have absorbed the full impulse and moved on +X.
    for (let i = 1; i < 10; i += 1) {
      const bodyPos = world.getComponent<{ position: number[] }>(state.bodyEntities[`b${i}`]!, "Transform")!.position;
      const expectedX = i * 0.5;
      // Tolerance: should be essentially the spawn anchor (no impulse
      // received). 1mm tolerance covers Rapier's internal numerical
      // drift on the very first step.
      expect(Math.abs(bodyPos[0]! - expectedX)).toBeLessThan(0.001);
    }
    adapter.dispose();
  });

  it("RagdollTeardownRequest cleans up bodies, joints, RagdollState", async () => {
    registerRagdollTemplate("pair2", {
      bodies: [
        { name: "a", shape: "sphere", dimensions: [0.1, 0, 0] },
        { name: "b", shape: "sphere", dimensions: [0.1, 0, 0], anchor: [1, 0, 0] }
      ],
      joints: [
        { name: "ab", bodyA: "a", bodyB: "b", type: "fixed", anchorA: [0.5, 0, 0], anchorB: [-0.5, 0, 0] }
      ]
    });
    const { world, adapter, tick } = await setup();
    world.addEntity("root.3");
    world.setComponent("root.3", "Transform", { position: [0, 0, 0] });
    world.setComponent("root.3", "RagdollSpawnRequest", { templateKey: "pair2" });
    tick();
    const state = world.getComponent<{ bodyEntities: Record<string, string>; jointEntities: string[] }>(
      "root.3",
      "RagdollState"
    )!;
    const aId = state.bodyEntities["a"]!;
    const bId = state.bodyEntities["b"]!;
    const jointId = state.jointEntities[0]!;
    const bodiesBefore = adapter.info().bodies;
    expect(world.hasEntity(aId)).toBe(true);
    expect(world.hasEntity(bId)).toBe(true);
    expect(world.hasEntity(jointId)).toBe(true);
    // Fire teardown.
    world.setComponent("root.3", "RagdollTeardownRequest", {});
    tick();
    expect(world.hasComponent("root.3", "RagdollState")).toBe(false);
    expect(world.hasComponent("root.3", "RagdollActive")).toBe(false);
    expect(world.hasComponent("root.3", "RagdollTeardownRequest")).toBe(false);
    expect(world.hasEntity(aId)).toBe(false);
    expect(world.hasEntity(bId)).toBe(false);
    expect(world.hasEntity(jointId)).toBe(false);
    expect(adapter.info().bodies).toBe(bodiesBefore - 2);
    adapter.dispose();
  });

  it("unknown template key is a silent no-op", async () => {
    const { world, tick, adapter } = await setup();
    world.addEntity("root.4");
    world.setComponent("root.4", "Transform", { position: [0, 0, 0] });
    world.setComponent("root.4", "RagdollSpawnRequest", { templateKey: "no-such-template" });
    tick();
    expect(world.hasComponent("root.4", "RagdollState")).toBe(false);
    expect(world.hasComponent("root.4", "RagdollSpawnRequest")).toBe(false); // request stripped
    adapter.dispose();
  });
});
