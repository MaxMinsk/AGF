// S131 — ragdoll mesh-handover primitive: spawn writes
// RagdollMeshBinding from the request's meshMap, sync mirrors body
// Transform onto each bound mesh, teardown clears the bindings but
// leaves mesh entities (and their last Transform) intact.

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

function registerSoloTemplate(): void {
  registerRagdollTemplate("solo", {
    bodies: [{ name: "torso", shape: "sphere", dimensions: [0.2, 0, 0] }]
  });
}

function registerPairTemplate(): void {
  registerRagdollTemplate("pair", {
    bodies: [
      { name: "torso", shape: "sphere", dimensions: [0.2, 0, 0], anchor: [0, 0, 0] },
      { name: "head", shape: "sphere", dimensions: [0.1, 0, 0], anchor: [0, 0.5, 0] }
    ],
    joints: [
      {
        name: "neck",
        bodyA: "torso",
        bodyB: "head",
        type: "ball",
        anchorA: [0, 0.25, 0],
        anchorB: [0, -0.25, 0]
      }
    ]
  });
}

describe("ragdoll mesh handover (S131)", () => {
  afterEach(() => clearRagdollTemplates());

  it("spawn with meshMap writes RagdollMeshBinding on each mapped mesh entity", async () => {
    registerPairTemplate();
    const { world, adapter, tick } = await setup();
    world.addEntity("root.1");
    world.setComponent("root.1", "Transform", { position: [0, 5, 0] });
    // Project mesh entities.
    world.addEntity("mesh.torso");
    world.setComponent("mesh.torso", "Transform", { position: [0, 5, 0] });
    world.addEntity("mesh.head");
    world.setComponent("mesh.head", "Transform", { position: [0, 5.5, 0] });
    world.setComponent("root.1", "RagdollSpawnRequest", {
      templateKey: "pair",
      meshMap: { torso: "mesh.torso", head: "mesh.head" }
    });
    tick();
    const torsoBinding = world.getComponent<{ ragdollRoot: string; bodyName: string; bodyEntity: string }>(
      "mesh.torso",
      "RagdollMeshBinding"
    );
    expect(torsoBinding).toBeDefined();
    expect(torsoBinding!.ragdollRoot).toBe("root.1");
    expect(torsoBinding!.bodyName).toBe("torso");
    expect(torsoBinding!.bodyEntity).toMatch(/^root\.1\.body\.torso\./);
    const headBinding = world.getComponent<{ bodyName: string }>("mesh.head", "RagdollMeshBinding");
    expect(headBinding?.bodyName).toBe("head");
    const state = world.getComponent<{ meshEntities: string[] }>("root.1", "RagdollState");
    expect(state?.meshEntities).toBeDefined();
    expect(state!.meshEntities.length).toBe(2);
    expect(state!.meshEntities).toContain("mesh.torso");
    expect(state!.meshEntities).toContain("mesh.head");
    adapter.dispose();
  });

  it("spawn without meshMap leaves no bindings (backward compat)", async () => {
    registerSoloTemplate();
    const { world, adapter, tick } = await setup();
    world.addEntity("root.2");
    world.setComponent("root.2", "Transform", { position: [0, 5, 0] });
    world.addEntity("mesh.torso");
    world.setComponent("mesh.torso", "Transform", { position: [0, 5, 0] });
    world.setComponent("root.2", "RagdollSpawnRequest", { templateKey: "solo" });
    tick();
    expect(world.hasComponent("mesh.torso", "RagdollMeshBinding")).toBe(false);
    const state = world.getComponent<{ meshEntities?: string[] }>("root.2", "RagdollState");
    expect(state?.meshEntities ?? []).toEqual([]);
    adapter.dispose();
  });

  it("sync copies body Transform → bound mesh Transform after gravity step", async () => {
    registerSoloTemplate();
    const { world, adapter, tick } = await setup();
    world.addEntity("root.3");
    world.setComponent("root.3", "Transform", { position: [0, 5, 0] });
    world.addEntity("mesh.torso");
    // Mesh starts somewhere else — sync should overwrite it.
    world.setComponent("mesh.torso", "Transform", { position: [-99, -99, -99] });
    world.setComponent("root.3", "RagdollSpawnRequest", {
      templateKey: "solo",
      meshMap: { torso: "mesh.torso" }
    });
    tick();
    // First tick already synced body + mesh. Mesh should be near (0, 5, 0).
    const meshAfter1 = world.getComponent<{ position: number[] }>("mesh.torso", "Transform")!;
    expect(meshAfter1.position[1]!).toBeGreaterThan(4); // gravity barely budged it
    expect(meshAfter1.position[0]!).toBeCloseTo(0, 3);
    // Run more ticks, mesh follows body's gravity fall.
    tick(60);
    const meshAfter61 = world.getComponent<{ position: number[] }>("mesh.torso", "Transform")!;
    const state = world.getComponent<{ bodyEntities: Record<string, string> }>("root.3", "RagdollState")!;
    const bodyTransform = world.getComponent<{ position: number[] }>(state.bodyEntities["torso"]!, "Transform")!;
    expect(meshAfter61.position[1]!).toBeCloseTo(bodyTransform.position[1]!, 5);
    expect(meshAfter61.position[1]!).toBeLessThan(meshAfter1.position[1]! - 1); // fell at least 1m
    adapter.dispose();
  });

  it("sync ignores meshes without bindings (no Transform writes outside the binding set)", async () => {
    registerSoloTemplate();
    const { world, adapter, tick } = await setup();
    world.addEntity("root.4");
    world.setComponent("root.4", "Transform", { position: [0, 5, 0] });
    world.addEntity("unrelated.mesh");
    const original = { position: [7, 7, 7] as [number, number, number] };
    world.setComponent("unrelated.mesh", "Transform", original);
    world.setComponent("root.4", "RagdollSpawnRequest", { templateKey: "solo" });
    tick(30);
    const after = world.getComponent<{ position: number[] }>("unrelated.mesh", "Transform")!;
    expect(after.position).toEqual([7, 7, 7]);
    adapter.dispose();
  });

  it("teardown clears RagdollMeshBinding but leaves the mesh entity + its last Transform intact", async () => {
    registerSoloTemplate();
    const { world, adapter, tick } = await setup();
    world.addEntity("root.5");
    world.setComponent("root.5", "Transform", { position: [0, 5, 0] });
    world.addEntity("mesh.torso");
    world.setComponent("mesh.torso", "Transform", { position: [-99, -99, -99] });
    world.setComponent("root.5", "RagdollSpawnRequest", {
      templateKey: "solo",
      meshMap: { torso: "mesh.torso" }
    });
    tick(30); // mesh + body fall together for half a sec
    expect(world.hasComponent("mesh.torso", "RagdollMeshBinding")).toBe(true);
    // Trigger teardown — sync still fires once during the teardown tick
    // (binding hasn't been cleared yet at sync time, only at teardown
    // time later in the same tick). What we care about is: NO MORE
    // syncs after teardown.
    world.setComponent("root.5", "RagdollTeardownRequest", {});
    tick();
    expect(world.hasComponent("mesh.torso", "RagdollMeshBinding")).toBe(false);
    expect(world.hasEntity("mesh.torso")).toBe(true); // entity preserved
    const afterTeardown = world.getComponent<{ position: number[] }>("mesh.torso", "Transform")!;
    const lockedY = afterTeardown.position[1]!;
    // Subsequent ticks must not touch the mesh's Transform.
    tick(30);
    const final = world.getComponent<{ position: number[] }>("mesh.torso", "Transform")!;
    expect(final.position[1]!).toBeCloseTo(lockedY, 5);
    adapter.dispose();
  });

  it("partial meshMap only binds the mapped bodies; unknown body names ignored", async () => {
    registerPairTemplate();
    const { world, adapter, tick } = await setup();
    world.addEntity("root.6");
    world.setComponent("root.6", "Transform", { position: [0, 5, 0] });
    world.addEntity("mesh.torso");
    world.setComponent("mesh.torso", "Transform", { position: [0, 5, 0] });
    world.addEntity("mesh.head");
    world.setComponent("mesh.head", "Transform", { position: [0, 5.5, 0] });
    world.setComponent("root.6", "RagdollSpawnRequest", {
      templateKey: "pair",
      // Only torso mapped; "missing" is an unknown body name and "mesh.head" is intentionally unbound.
      meshMap: { torso: "mesh.torso", missing: "mesh.head" }
    });
    tick();
    expect(world.hasComponent("mesh.torso", "RagdollMeshBinding")).toBe(true);
    expect(world.hasComponent("mesh.head", "RagdollMeshBinding")).toBe(false);
    const state = world.getComponent<{ meshEntities: string[] }>("root.6", "RagdollState")!;
    expect(state.meshEntities).toEqual(["mesh.torso"]);
    adapter.dispose();
  });

  it("meshMap pointing at a non-existent entity is silently skipped", async () => {
    registerSoloTemplate();
    const { world, adapter, tick } = await setup();
    world.addEntity("root.7");
    world.setComponent("root.7", "Transform", { position: [0, 5, 0] });
    world.setComponent("root.7", "RagdollSpawnRequest", {
      templateKey: "solo",
      meshMap: { torso: "mesh.does-not-exist" }
    });
    expect(() => tick()).not.toThrow();
    const state = world.getComponent<{ meshEntities: string[] }>("root.7", "RagdollState")!;
    expect(state.meshEntities).toEqual([]);
    adapter.dispose();
  });
});
