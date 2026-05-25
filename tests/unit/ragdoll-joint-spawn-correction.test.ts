// S137 — verify the S137 joint-anchor correction keeps the
// constraint solver quiet on frame 0 even when bodyPoses places bodies
// in non-rest configurations.
//
// Test strategy: 3-body chain (a → b → c) with two ball joints. Spawn
// each body at a deliberately rotated, off-rest position via bodyPoses
// such that the rest-pose joint anchors WOULD violate the constraint.
// Tick once with zero gravity, zero impulse, zero damping.
//
// Pre-fix: Rapier's constraint solver would have fired a corrective
// impulse on frame 1 → bodies drift by metres.
// Post-fix: the corrected anchorB makes the joint world positions
// match at spawn → no impulse → bodies stay put.

import { afterEach, describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import type { SystemContext } from "../../engine/core/systems/types";
import { createRapierAdapter, type RapierAdapter } from "../../engine/physics/rapier/rapier-adapter";
import { createRagdollSpawnSystem } from "../../engine/physics/ragdoll/spawn-system";
import { createRagdollSyncSystem } from "../../engine/physics/ragdoll/sync-system";
import {
  clearRagdollTemplates,
  registerRagdollTemplate
} from "../../engine/physics/ragdoll/template-registry";

const FIXED_DT = 1 / 60;

async function setup(): Promise<{ world: World; adapter: RapierAdapter; tick: (steps?: number) => void }> {
  const adapter = await createRapierAdapter({ gravity: [0, 0, 0], fixedDt: FIXED_DT });
  const world = new World();
  const spawn = createRagdollSpawnSystem({ adapter });
  const sync = createRagdollSyncSystem({ adapter });
  let stepCount = 0;
  const tick = (steps = 1): void => {
    for (let i = 0; i < steps; i += 1) {
      const ctx: SystemContext = {
        world,
        time: { elapsed: stepCount * FIXED_DT, dt: FIXED_DT, fixedDt: FIXED_DT, frameCount: stepCount, fixedStepCount: stepCount }
      } as SystemContext;
      spawn.fixedUpdate?.(ctx);
      adapter.step(FIXED_DT);
      sync.fixedUpdate?.(ctx);
      stepCount += 1;
    }
  };
  return { world, adapter, tick };
}

describe("S137 joint-anchor spawn correction", () => {
  afterEach(() => clearRagdollTemplates());

  it("rest-pose spawn (no bodyPoses) — joints don't move bodies on frame 1", async () => {
    // Rest pose: template anchors already satisfy the constraint. The
    // correction is a no-op here; verifies backward compatibility.
    registerRagdollTemplate("rest", {
      linearDamping: 0,
      angularDamping: 0,
      bodies: [
        { name: "a", shape: "sphere", dimensions: [0.05, 0, 0], anchor: [0, 0, 0] },
        { name: "b", shape: "sphere", dimensions: [0.05, 0, 0], anchor: [0, 1, 0] }
      ],
      joints: [
        { name: "ab", bodyA: "a", bodyB: "b", type: "ball", anchorA: [0, 0.5, 0], anchorB: [0, -0.5, 0] }
      ]
    });
    const { world, adapter, tick } = await setup();
    world.addEntity("root");
    world.setComponent("root", "Transform", { position: [10, 5, 10] });
    world.setComponent("root", "RagdollSpawnRequest", { templateKey: "rest" });
    tick();
    const state = world.getComponent<{ bodyEntities: Record<string, string> }>("root", "RagdollState")!;
    const aPos = world.getComponent<{ position: number[] }>(state.bodyEntities["a"]!, "Transform")!.position;
    const bPos = world.getComponent<{ position: number[] }>(state.bodyEntities["b"]!, "Transform")!.position;
    expect(aPos[0]!).toBeCloseTo(10, 4);
    expect(aPos[1]!).toBeCloseTo(5, 4);
    expect(aPos[2]!).toBeCloseTo(10, 4);
    expect(bPos[0]!).toBeCloseTo(10, 4);
    expect(bPos[1]!).toBeCloseTo(6, 4);
    expect(bPos[2]!).toBeCloseTo(10, 4);
    adapter.dispose();
  });

  it("non-rest bodyPoses — joints stay quiet because anchorB is corrected", async () => {
    // bodyPoses places body a at (10, 5, 10) but body b is shifted off
    // its rest-pose offset to (10.3, 5.8, 10) AND rotated 30deg about Z.
    // The rest-pose template anchors would put the joint world position
    // at (10, 5.5, 10) from A and (10.3 + offset, 5.8 - 0.5, 10) from B
    // — mismatch by ~0.3m. With correction the anchors are adjusted at
    // spawn so the constraint is satisfied at frame 0.
    registerRagdollTemplate("offpose", {
      linearDamping: 0,
      angularDamping: 0,
      bodies: [
        { name: "a", shape: "sphere", dimensions: [0.05, 0, 0], anchor: [0, 0, 0] },
        { name: "b", shape: "sphere", dimensions: [0.05, 0, 0], anchor: [0, 1, 0] }
      ],
      joints: [
        { name: "ab", bodyA: "a", bodyB: "b", type: "ball", anchorA: [0, 0.5, 0], anchorB: [0, -0.5, 0] }
      ]
    });
    const { world, adapter, tick } = await setup();
    world.addEntity("root2");
    world.setComponent("root2", "Transform", { position: [0, 0, 0] });
    world.setComponent("root2", "RagdollSpawnRequest", {
      templateKey: "offpose",
      bodyPoses: {
        a: { position: [10, 5, 10], rotation: [0, 0, 0] },
        b: { position: [10.3, 5.8, 10], rotation: [0, 0, 30] }
      }
    });
    tick();
    const state = world.getComponent<{ bodyEntities: Record<string, string> }>("root2", "RagdollState")!;
    const aPos = world.getComponent<{ position: number[] }>(state.bodyEntities["a"]!, "Transform")!.position;
    const bPos = world.getComponent<{ position: number[] }>(state.bodyEntities["b"]!, "Transform")!.position;
    // Both bodies should still be essentially at their bodyPoses spawn
    // positions. Pre-fix the joint would have yanked them toward each
    // other (constraint correction kicks in with magnitude proportional
    // to the anchor mismatch). Tolerance 0.01m: allows for Rapier's
    // internal solver slack while catching macro drift.
    expect(Math.abs(aPos[0]! - 10)).toBeLessThan(0.01);
    expect(Math.abs(aPos[1]! - 5)).toBeLessThan(0.01);
    expect(Math.abs(bPos[0]! - 10.3)).toBeLessThan(0.01);
    expect(Math.abs(bPos[1]! - 5.8)).toBeLessThan(0.01);
    adapter.dispose();
  });

  it("non-rest bodyPoses + multi-step tick — bodies remain near their spawn pose", async () => {
    // Same offset pose as above, but tick 10 steps. With damping = 0
    // any residual impulse would compound; bodies must NOT drift.
    registerRagdollTemplate("offpose2", {
      linearDamping: 0,
      angularDamping: 0,
      bodies: [
        { name: "a", shape: "sphere", dimensions: [0.05, 0, 0], anchor: [0, 0, 0] },
        { name: "b", shape: "sphere", dimensions: [0.05, 0, 0], anchor: [0, 1, 0] }
      ],
      joints: [
        { name: "ab", bodyA: "a", bodyB: "b", type: "ball", anchorA: [0, 0.5, 0], anchorB: [0, -0.5, 0] }
      ]
    });
    const { world, adapter, tick } = await setup();
    world.addEntity("root3");
    world.setComponent("root3", "Transform", { position: [0, 0, 0] });
    world.setComponent("root3", "RagdollSpawnRequest", {
      templateKey: "offpose2",
      bodyPoses: {
        a: { position: [0, 5, 0], rotation: [0, 0, 0] },
        b: { position: [0.2, 5.9, 0.1], rotation: [10, 20, -15] }
      }
    });
    tick(10);
    const state = world.getComponent<{ bodyEntities: Record<string, string> }>("root3", "RagdollState")!;
    const aPos = world.getComponent<{ position: number[] }>(state.bodyEntities["a"]!, "Transform")!.position;
    const bPos = world.getComponent<{ position: number[] }>(state.bodyEntities["b"]!, "Transform")!.position;
    // 10 ticks at dt=1/60 = ~0.17s. Without spring drift the bodies
    // stay essentially at spawn (no gravity, no impulse, no damping).
    expect(Math.abs(aPos[0]! - 0)).toBeLessThan(0.02);
    expect(Math.abs(aPos[1]! - 5)).toBeLessThan(0.02);
    expect(Math.abs(bPos[0]! - 0.2)).toBeLessThan(0.02);
    expect(Math.abs(bPos[1]! - 5.9)).toBeLessThan(0.02);
    adapter.dispose();
  });
});
