// M24-sync integration spike — drives the PhysicsSyncSystem against a
// real Rapier world (not the stub adapter used in unit tests). Builds
// an ECS world with one fixed ground + one dynamic cube, runs the
// system across 60 fixed steps, asserts the cube's Transform fell.
//
// Run with:  npx tsx spikes/physics-rapier-v0/sync-spike.ts

import RAPIER from "@dimforge/rapier3d-compat";

import { World } from "../../engine/core/ecs/world";
import { createAdapterFromModule } from "../../engine/physics/rapier/rapier-adapter";
import { createPhysicsBodyRegistry } from "../../engine/physics/rapier/physics-body-registry";
import { createPhysicsSyncSystem } from "../../engine/physics/rapier/physics-sync-system";

async function main(): Promise<void> {
  await RAPIER.init();
  const adapter = createAdapterFromModule(RAPIER);
  const registry = createPhysicsBodyRegistry(adapter);

  const world = new World();
  world.addEntity("ground");
  world.setComponent("ground", "Transform", { position: [0, -0.1, 0] });
  world.setComponent("ground", "RigidBody3D", { type: "fixed" });
  world.setComponent("ground", "Collider3D", { kind: "box", size: [10, 0.2, 10] });

  world.addEntity("cube");
  world.setComponent("cube", "Transform", { position: [0, 2.5, 0] });
  world.setComponent("cube", "RigidBody3D", { type: "dynamic", mass: 1 });
  world.setComponent("cube", "Collider3D", { kind: "box", size: [0.5, 0.5, 0.5] });

  const system = createPhysicsSyncSystem(registry, adapter);
  const time = { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 };

  const t0 = performance.now();
  for (let i = 0; i < 60; i += 1) {
    system.fixedUpdate?.({ time, world });
  }
  const stepMs = performance.now() - t0;

  const cube = world.getComponent<{ position: ReadonlyArray<number> }>("cube", "Transform");
  console.log(`[sync-spike] 60 steps took ${stepMs.toFixed(2)} ms`);
  console.log(`[sync-spike] cube transform y after 1 sim-second: ${cube?.position[1]?.toFixed(4)}`);
  console.log(`[sync-spike] registry bodies: ${registry.size()}`);

  if ((cube?.position[1] ?? 99) > 1.5) {
    throw new Error("[sync-spike] cube did not fall — transform writeback broken?");
  }

  adapter.dispose();
}

void main();
