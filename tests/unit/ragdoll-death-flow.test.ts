// S134 — end-to-end ragdoll death-flow integration test.
//
// Wires the kaboom death-trigger + engine spawn/sync/teardown systems
// together with the real Rapier adapter + the kaboom-bomber template.
// Proves the full migration chain (S126-S133) actually works when
// composed — every prior test covered one link in isolation.

import { afterEach, describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import type { SystemContext } from "../../engine/core/systems/types";
import {
  KABOOM_BOMBER_RAGDOLL,
  KABOOM_BOMBER_RAGDOLL_KEY
} from "../../examples/kaboom-crew/src/characters/kaboom-bomber-ragdoll-template";
import { createKaboomDeathTriggerSystem } from "../../examples/kaboom-crew/src/systems/death-trigger-system";
import { createRapierAdapter, type RapierAdapter } from "../../engine/physics/rapier/rapier-adapter";
import { createRagdollSpawnSystem } from "../../engine/physics/ragdoll/spawn-system";
import { createRagdollSyncSystem } from "../../engine/physics/ragdoll/sync-system";
import { createRagdollTeardownSystem } from "../../engine/physics/ragdoll/teardown-system";
import {
  clearRagdollTemplates,
  registerRagdollTemplate
} from "../../engine/physics/ragdoll/template-registry";
import { createTransformResolveSystem } from "../../engine/render/systems/transform-resolve-system";

const FIXED_DT = 1 / 60;

// kaboom-bomber 10 mesh names. Matches BODY_TO_MESH_SUFFIX in
// death-trigger-system.ts.
const MESH_SUFFIXES = [
  "torso",
  "head",
  "upperArmL",
  "forearmL",
  "upperArmR",
  "forearmR",
  "upperLegL",
  "lowerLegL",
  "upperLegR",
  "lowerLegR"
];

const BODY_NAMES = [
  "torso",
  "head",
  "upperArm.l",
  "forearm.l",
  "upperArm.r",
  "forearm.r",
  "upperLeg.l",
  "lowerLeg.l",
  "upperLeg.r",
  "lowerLeg.r"
];

async function setup(): Promise<{
  world: World;
  adapter: RapierAdapter;
  tick: (steps?: number) => void;
}> {
  const adapter = await createRapierAdapter({ gravity: [0, -9.81, 0], fixedDt: FIXED_DT });
  const world = new World();
  const trigger = createKaboomDeathTriggerSystem();
  const spawn = createRagdollSpawnSystem({ adapter });
  const sync = createRagdollSyncSystem({ adapter });
  const teardown = createRagdollTeardownSystem({ adapter });
  // S135 — also tick the renderer's transform-resolve so accessory
  // LocalToWorld is recomputed from the hierarchy each step. Real
  // app runs this in frameUpdate but we run it inside the same tick
  // for simplicity (no consumer reads partial state mid-tick here).
  const transformResolve = createTransformResolveSystem();
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
      // Same order src/app.ts uses for physics.enabled projects.
      trigger.fixedUpdate?.(ctx);
      spawn.fixedUpdate?.(ctx);
      adapter.step(FIXED_DT);
      sync.fixedUpdate?.(ctx);
      teardown.fixedUpdate?.(ctx);
      transformResolve.frameUpdate?.(ctx);
      stepCount += 1;
    }
  };
  return { world, adapter, tick };
}

function addBomberWithProceduralTree(world: World, rootId: string): void {
  world.addEntity(rootId);
  world.setComponent(rootId, "Transform", { position: [5, 0, 5] });
  world.setComponent(rootId, "BomberStats", { alive: true });
  // 10 mesh entities, each a child of the root for simplicity. Real
  // procedural tree has pivots in between, but for this integration
  // test the convention <root>.<suffix> + parent chain to root is
  // enough to exercise the trigger's detach + meshMap logic.
  for (let i = 0; i < MESH_SUFFIXES.length; i += 1) {
    const suffix = MESH_SUFFIXES[i]!;
    const id = `${rootId}.${suffix}`;
    world.addEntity(id);
    world.setComponent(id, "Transform", { position: [0, 0, 0], parent: rootId });
    // Stamp LocalToWorld so death-trigger can compose bodyPoses. Values
    // mirror a plausible bomber pose: torso at (5, 1, 5), head above,
    // limbs offset in X.
    world.setComponent(id, "LocalToWorld", {
      position: [5 + (i % 3 - 1) * 0.3, 1 + (i < 2 ? i * 0.5 : 0.5), 5],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
  }
}

describe("ragdoll death-flow end-to-end (S134)", () => {
  afterEach(() => clearRagdollTemplates());

  it("full chain: alive=false → meshMap + bodyPoses + spawn + bind + sync + teardown", async () => {
    registerRagdollTemplate(KABOOM_BOMBER_RAGDOLL_KEY, KABOOM_BOMBER_RAGDOLL);
    const { world, adapter, tick } = await setup();
    addBomberWithProceduralTree(world, "bot.1");
    world.setComponent("bot.1", "DeathImpulse", { blastOriginGx: 3, blastOriginGz: 5, magnitude: 2 });

    // Step 1: bomber alive — trigger initialises prevAlive but writes nothing.
    tick();
    expect(world.hasComponent("bot.1", "RagdollSpawnRequest")).toBe(false);
    expect(world.hasComponent("bot.1", "RagdollActive")).toBe(false);

    // Step 2: alive → false. Trigger writes RagdollSpawnRequest with
    // 10-entry meshMap + 10-entry bodyPoses. Engine spawn-system
    // consumes it the SAME tick (spawn runs after trigger).
    world.setComponent("bot.1", "BomberStats", { alive: false });
    tick();

    // After step 2: RagdollActive set, 10 body entities created, 10
    // mesh bindings written, RagdollSpawnRequest stripped, mesh
    // Transform.parent cleared.
    expect(world.hasComponent("bot.1", "RagdollActive")).toBe(true);
    expect(world.hasComponent("bot.1", "RagdollSpawnRequest")).toBe(false);
    const state = world.getComponent<{
      templateKey: string;
      bodyEntities: Record<string, string>;
      meshEntities: string[];
    }>("bot.1", "RagdollState")!;
    expect(state.templateKey).toBe(KABOOM_BOMBER_RAGDOLL_KEY);
    expect(Object.keys(state.bodyEntities).length).toBe(10);
    expect(state.meshEntities.length).toBe(10);
    for (const name of BODY_NAMES) expect(state.bodyEntities[name]).toBeDefined();
    for (let i = 0; i < MESH_SUFFIXES.length; i += 1) {
      const suffix = MESH_SUFFIXES[i]!;
      const meshId = `bot.1.${suffix}`;
      const t = world.getComponent<{ parent?: string }>(meshId, "Transform");
      expect(t?.parent).toBeUndefined(); // detached
      expect(world.hasComponent(meshId, "RagdollMeshBinding")).toBe(true);
    }

    // Step 3: gravity ticks — meshes should track their bound bodies.
    // Capture the body's position after a few ticks and the mesh's
    // position; they must be near-equal.
    tick(30);
    for (const bodyName of BODY_NAMES) {
      const bodyId = state.bodyEntities[bodyName]!;
      const bodyT = world.getComponent<{ position: number[] }>(bodyId, "Transform")!;
      // Find which mesh suffix maps to this body name.
      const idx = BODY_NAMES.indexOf(bodyName);
      const meshSuffix = MESH_SUFFIXES[idx]!;
      const meshT = world.getComponent<{ position: number[] }>(`bot.1.${meshSuffix}`, "Transform")!;
      expect(meshT.position[0]!).toBeCloseTo(bodyT.position[0]!, 4);
      expect(meshT.position[1]!).toBeCloseTo(bodyT.position[1]!, 4);
      expect(meshT.position[2]!).toBeCloseTo(bodyT.position[2]!, 4);
    }

    // Step 4: teardown request. After one more tick: bindings cleared,
    // body entities removed, root keeps Transform but loses
    // RagdollActive + RagdollState.
    world.setComponent("bot.1", "RagdollTeardownRequest", {});
    tick();
    expect(world.hasComponent("bot.1", "RagdollActive")).toBe(false);
    expect(world.hasComponent("bot.1", "RagdollState")).toBe(false);
    for (let i = 0; i < MESH_SUFFIXES.length; i += 1) {
      const suffix = MESH_SUFFIXES[i]!;
      const meshId = `bot.1.${suffix}`;
      expect(world.hasComponent(meshId, "RagdollMeshBinding")).toBe(false);
      expect(world.hasEntity(meshId)).toBe(true); // mesh entity preserved
    }
    for (const bodyName of BODY_NAMES) {
      // The body entities themselves should be gone after teardown.
      const bodyEntityIds = Object.values(state.bodyEntities);
      for (const id of bodyEntityIds) {
        expect(world.hasEntity(id)).toBe(false);
      }
      void bodyName;
    }

    adapter.dispose();
  });

  it("accessory parented to head mesh follows the ragdoll body via hierarchy (S135)", async () => {
    registerRagdollTemplate(KABOOM_BOMBER_RAGDOLL_KEY, KABOOM_BOMBER_RAGDOLL);
    const { world, adapter, tick } = await setup();
    addBomberWithProceduralTree(world, "bot.2");
    // Antenna accessory: parented to the head mesh entity, offset
    // +0.4 m along Y. After death the head mesh is detached from
    // its pivot and its Transform is driven by ragdoll sync; the
    // renderer's hierarchy resolve should keep the antenna's
    // LocalToWorld at head_world + [0, 0.4, 0] (composed by head's
    // body rotation).
    const ACCESSORY_OFFSET: [number, number, number] = [0, 0.4, 0];
    world.addEntity("bot.2.accessory0.antenna");
    world.setComponent("bot.2.accessory0.antenna", "Transform", {
      parent: "bot.2.head",
      position: ACCESSORY_OFFSET,
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    world.setComponent("bot.2", "DeathImpulse", { blastOriginGx: 3, blastOriginGz: 5, magnitude: 2 });

    // Two ticks to seed prevAlive and write the spawn request.
    tick();
    world.setComponent("bot.2", "BomberStats", { alive: false });
    tick();
    expect(world.hasComponent("bot.2", "RagdollActive")).toBe(true);
    const state = world.getComponent<{ bodyEntities: Record<string, string> }>("bot.2", "RagdollState")!;
    const headBodyId = state.bodyEntities["head"]!;
    expect(headBodyId).toBeDefined();

    // Let the ragdoll integrate so the head body moves off its spawn
    // pose under gravity + impulse.
    tick(30);

    const headBodyT = world.getComponent<{ position: number[] }>(headBodyId, "Transform")!;
    const headMeshT = world.getComponent<{ position: number[]; parent?: string }>("bot.2.head", "Transform")!;
    const accessoryLtw = world.getComponent<{ position: number[] }>(
      "bot.2.accessory0.antenna",
      "LocalToWorld"
    );
    // Head mesh tracks the head body 1:1 (sync writes its position
    // directly).
    expect(headMeshT.position[0]!).toBeCloseTo(headBodyT.position[0]!, 4);
    expect(headMeshT.position[1]!).toBeCloseTo(headBodyT.position[1]!, 4);
    expect(headMeshT.position[2]!).toBeCloseTo(headBodyT.position[2]!, 4);
    expect(headMeshT.parent).toBeUndefined(); // detached by death-trigger
    // Accessory still parented to the head mesh — the death-trigger
    // only detaches the 10 body meshes, not the accessory.
    const accessoryT = world.getComponent<{ parent?: string }>(
      "bot.2.accessory0.antenna",
      "Transform"
    )!;
    expect(accessoryT.parent).toBe("bot.2.head");
    // The hierarchy resolve composes accessory.LTW = head.LTW *
    // accessory.local. Head.LTW position equals headMeshT.position
    // since head has no parent now (detached). The accessory's local
    // position is [0, 0.4, 0] with identity rotation; head's body
    // rotation is whatever Rapier integrated. To avoid pinning down
    // the exact rotation we assert the L2 distance from the head's
    // world position is ~0.4 (rotation preserves the offset length).
    expect(accessoryLtw).not.toBeUndefined();
    const dx = accessoryLtw!.position[0]! - headBodyT.position[0]!;
    const dy = accessoryLtw!.position[1]! - headBodyT.position[1]!;
    const dz = accessoryLtw!.position[2]! - headBodyT.position[2]!;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    expect(dist).toBeCloseTo(0.4, 3);

    adapter.dispose();
  });
});
