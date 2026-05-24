// S133 — RagdollSpawnRequest.bodyPoses overrides template anchors
// per body at spawn time. Closes the visual-jump caveat from S132 by
// letting projects pose-snapshot each body to its mesh's current
// world transform at the moment of death.

import { afterEach, describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import type { SystemContext } from "../../engine/core/systems/types";
import { createRapierAdapter, type RapierAdapter } from "../../engine/physics/rapier/rapier-adapter";
import { createRagdollSpawnSystem } from "../../engine/physics/ragdoll/spawn-system";
import {
  clearRagdollTemplates,
  registerRagdollTemplate
} from "../../engine/physics/ragdoll/template-registry";

const FIXED_DT = 1 / 60;

async function setup(): Promise<{ world: World; adapter: RapierAdapter; tick: (steps?: number) => void }> {
  const adapter = await createRapierAdapter({ gravity: [0, -9.81, 0], fixedDt: FIXED_DT });
  const world = new World();
  const spawn = createRagdollSpawnSystem({ adapter });
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
      stepCount += 1;
    }
  };
  return { world, adapter, tick };
}

function registerPairTemplate(): void {
  registerRagdollTemplate("pair", {
    bodies: [
      { name: "torso", shape: "sphere", dimensions: [0.2, 0, 0], anchor: [0, 0, 0] },
      { name: "head", shape: "sphere", dimensions: [0.1, 0, 0], anchor: [0, 0.5, 0] }
    ]
  });
}

describe("ragdoll spawn — bodyPoses override (S133)", () => {
  afterEach(() => clearRagdollTemplates());

  it("bodyPoses positions bodies at the provided world coords (override anchor)", async () => {
    registerPairTemplate();
    const { world, adapter, tick } = await setup();
    world.addEntity("root.1");
    // Template anchor for torso = [0, 0, 0], head = [0, 0.5, 0]; with
    // root at [10, 0, 0] the default spawn would be torso=[10,0,0],
    // head=[10,0.5,0]. bodyPoses below sends each body somewhere else.
    world.setComponent("root.1", "Transform", { position: [10, 0, 0] });
    world.setComponent("root.1", "RagdollSpawnRequest", {
      templateKey: "pair",
      bodyPoses: {
        torso: { position: [3, 7, -2] },
        head: { position: [3, 7.5, -2] }
      }
    });
    tick();
    const state = world.getComponent<{ bodyEntities: Record<string, string> }>("root.1", "RagdollState")!;
    const torso = world.getComponent<{ position: number[] }>(state.bodyEntities["torso"]!, "Transform")!;
    expect(torso.position[0]).toBeCloseTo(3, 3);
    expect(torso.position[1]).toBeCloseTo(7, 3);
    expect(torso.position[2]).toBeCloseTo(-2, 3);
    const head = world.getComponent<{ position: number[] }>(state.bodyEntities["head"]!, "Transform")!;
    expect(head.position[0]).toBeCloseTo(3, 3);
    expect(head.position[1]).toBeCloseTo(7.5, 3);
    expect(head.position[2]).toBeCloseTo(-2, 3);
    adapter.dispose();
  });

  it("partial bodyPoses: only listed bodies overridden, the rest fall back to root + anchor", async () => {
    registerPairTemplate();
    const { world, adapter, tick } = await setup();
    world.addEntity("root.2");
    world.setComponent("root.2", "Transform", { position: [10, 0, 0] });
    world.setComponent("root.2", "RagdollSpawnRequest", {
      templateKey: "pair",
      bodyPoses: { torso: { position: [0, 0, 0] } } // only torso
    });
    tick();
    const state = world.getComponent<{ bodyEntities: Record<string, string> }>("root.2", "RagdollState")!;
    const torso = world.getComponent<{ position: number[] }>(state.bodyEntities["torso"]!, "Transform")!;
    expect(torso.position[0]).toBeCloseTo(0, 3); // override
    const head = world.getComponent<{ position: number[] }>(state.bodyEntities["head"]!, "Transform")!;
    // head fell back to root + anchor → [10, 0.5, 0].
    expect(head.position[0]).toBeCloseTo(10, 3);
    expect(head.position[1]).toBeCloseTo(0.5, 3);
    adapter.dispose();
  });

  it("bodyPoses[].rotation is honoured (deg → Rapier internal rad)", async () => {
    registerRagdollTemplate("rot", {
      bodies: [{ name: "torso", shape: "box", dimensions: [0.2, 0.2, 0.2] }]
    });
    const { world, adapter, tick } = await setup();
    world.addEntity("root.3");
    world.setComponent("root.3", "Transform", { position: [0, 5, 0] });
    world.setComponent("root.3", "RagdollSpawnRequest", {
      templateKey: "rot",
      bodyPoses: { torso: { position: [0, 5, 0], rotation: [0, 90, 0] } }
    });
    tick();
    const state = world.getComponent<{ bodyEntities: Record<string, string> }>("root.3", "RagdollState")!;
    const torso = world.getComponent<{ rotation: number[] }>(state.bodyEntities["torso"]!, "Transform")!;
    // 90deg Y rotation should be preserved (small delta from one
    // gravity-tick rotation under no torque).
    expect(torso.rotation[1]).toBeGreaterThan(85);
    expect(torso.rotation[1]).toBeLessThan(95);
    adapter.dispose();
  });

  it("unknown body names in bodyPoses are silently skipped", async () => {
    registerPairTemplate();
    const { world, adapter, tick } = await setup();
    world.addEntity("root.4");
    world.setComponent("root.4", "Transform", { position: [0, 0, 0] });
    world.setComponent("root.4", "RagdollSpawnRequest", {
      templateKey: "pair",
      bodyPoses: {
        torso: { position: [1, 1, 1] },
        notAThing: { position: [99, 99, 99] }
      }
    });
    expect(() => tick()).not.toThrow();
    const state = world.getComponent<{ bodyEntities: Record<string, string> }>("root.4", "RagdollState")!;
    expect(Object.keys(state.bodyEntities).sort()).toEqual(["head", "torso"]);
    const torso = world.getComponent<{ position: number[] }>(state.bodyEntities["torso"]!, "Transform")!;
    expect(torso.position[0]).toBeCloseTo(1, 3);
    adapter.dispose();
  });

  it("spawn without bodyPoses still uses template anchors (backward compat)", async () => {
    registerPairTemplate();
    const { world, adapter, tick } = await setup();
    world.addEntity("root.5");
    world.setComponent("root.5", "Transform", { position: [10, 0, 0] });
    world.setComponent("root.5", "RagdollSpawnRequest", { templateKey: "pair" });
    tick();
    const state = world.getComponent<{ bodyEntities: Record<string, string> }>("root.5", "RagdollState")!;
    const torso = world.getComponent<{ position: number[] }>(state.bodyEntities["torso"]!, "Transform")!;
    expect(torso.position[0]).toBeCloseTo(10, 3); // root + anchor[0]=0
    expect(torso.position[1]).toBeCloseTo(0, 3); // anchor[1]=0 (no gravity yet — body Transform is the spawn pose)
    const head = world.getComponent<{ position: number[] }>(state.bodyEntities["head"]!, "Transform")!;
    expect(head.position[1]).toBeCloseTo(0.5, 3); // root + anchor[1]=0.5
    adapter.dispose();
  });
});
