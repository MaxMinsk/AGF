// M24-sensors: end-to-end. Cube falls into a sensor volume; the System
// writes OverlappingTriggers3D on both entities after the contact step.
//
// Run with:  npx tsx spikes/physics-rapier-v0/sensor-spike.ts

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

  // Sensor volume sitting at the origin.
  world.addEntity("pickup");
  world.setComponent("pickup", "Transform", { position: [0, 0.5, 0] });
  world.setComponent("pickup", "RigidBody3D", { type: "fixed" });
  world.setComponent("pickup", "Collider3D", { kind: "box", size: [1, 1, 1], sensor: true });

  // Cube falling onto the sensor.
  world.addEntity("cube");
  world.setComponent("cube", "Transform", { position: [0, 4, 0] });
  world.setComponent("cube", "RigidBody3D", { type: "dynamic", mass: 1 });
  world.setComponent("cube", "Collider3D", { kind: "box", size: [0.5, 0.5, 0.5] });

  const system = createPhysicsSyncSystem(registry, adapter);
  const time = { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 };

  for (let i = 0; i < 90; i += 1) {
    system.fixedUpdate?.({ time, world });
  }

  const overlaps = world.getComponent<{ entities: string[] }>("pickup", "OverlappingTriggers3D");
  const cubeOverlap = world.getComponent<{ entities: string[] }>("cube", "OverlappingTriggers3D");
  const cubePos = world.getComponent<{ position: ReadonlyArray<number> }>("cube", "Transform");

  console.log(`[sensor-spike] cube final y=${cubePos?.position[1]?.toFixed(3)}`);
  console.log(`[sensor-spike] pickup overlaps: ${JSON.stringify(overlaps?.entities ?? [])}`);
  console.log(`[sensor-spike] cube overlaps:   ${JSON.stringify(cubeOverlap?.entities ?? [])}`);

  if (!(overlaps?.entities ?? []).includes("cube")) {
    throw new Error("[sensor-spike] FAIL — sensor did not see the cube");
  }
  adapter.dispose();
}

void main();
