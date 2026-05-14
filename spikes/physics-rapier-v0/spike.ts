// M24-investigate: minimal Rapier3D spike. Initializes the WASM
// runtime, builds a 1-cube-on-1-plane world, steps it for ~1 simulated
// second at a fixed 1/60 dt, prints the cube position.
//
// Run with:  npx tsx spikes/physics-rapier-v0/spike.ts
//
// Nothing in engine/ depends on this file — when this spike is happy,
// the followups M24-schema / M24-adapter port the lessons into the real
// engine modules.

import RAPIER from "@dimforge/rapier3d-compat";

async function main(): Promise<void> {
  const t0 = performance.now();
  await RAPIER.init();
  const initMs = performance.now() - t0;
  console.log(`[rapier-spike] init() took ${initMs.toFixed(1)} ms`);

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // Fixed-step convention — never derive from render delta.
  const fixedDt = 1 / 60;
  world.timestep = fixedDt;

  // Fixed ground plane at y=0.
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(5, 0.1, 5).setTranslation(0, -0.1, 0),
    groundBody
  );

  // Dynamic cube starting at y=2.5.
  const cubeBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2.5, 0)
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.25, 0.25, 0.25), cubeBody);

  const stepStart = performance.now();
  for (let i = 0; i < 60; i += 1) {
    world.step();
  }
  const stepMs = performance.now() - stepStart;
  const pos = cubeBody.translation();

  console.log(`[rapier-spike] 60 fixed steps took ${stepMs.toFixed(2)} ms`);
  console.log(`[rapier-spike] cube y after 1 sim-second: ${pos.y.toFixed(4)}`);

  if (pos.y > 1.5) {
    throw new Error(`[rapier-spike] cube did not fall — y=${pos.y} (expected < 1.5)`);
  }
  if (stepMs > 50) {
    console.warn(`[rapier-spike] WARN — 60 steps took > 50ms; budget tighter than expected`);
  }
}

void main();
