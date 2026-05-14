// M24-adapter sanity check — exercises the AGF Rapier adapter API the
// way M24-sync will eventually exercise it from a system: acquire bodies,
// acquire colliders, step, read transforms back, release.
//
// Run with:  npx tsx spikes/physics-rapier-v0/adapter-spike.ts
//
// Verifies the adapter wires Rapier correctly without going through the
// full engine boot. Once M24-sync lands a real System, this spike is
// kept as a quick smoke test.

import RAPIER from "@dimforge/rapier3d-compat";
import { createAdapterFromModule } from "../../engine/physics/rapier/rapier-adapter";

async function main(): Promise<void> {
  await RAPIER.init();
  const adapter = createAdapterFromModule(RAPIER);

  // Static ground.
  const ground = adapter.acquireBody({ kind: "fixed", position: [0, -0.1, 0] });
  adapter.acquireCollider(ground, { kind: "box", size: [10, 0.2, 10] });

  // Dynamic cube + capsule + sphere — exercise every primitive shape.
  const cube = adapter.acquireBody({ kind: "dynamic", position: [0, 2.5, 0], mass: 1 });
  adapter.acquireCollider(cube, { kind: "box", size: [0.5, 0.5, 0.5] });

  const ball = adapter.acquireBody({ kind: "dynamic", position: [1, 3, 0], mass: 1 });
  adapter.acquireCollider(ball, { kind: "sphere", radius: 0.3, restitution: 0.4 });

  const capsule = adapter.acquireBody({
    kind: "dynamic",
    position: [-1, 4, 0],
    mass: 1,
    lockRotations: true
  });
  adapter.acquireCollider(capsule, { kind: "capsule", radius: 0.3, halfHeight: 0.6 });

  console.log(`[adapter-spike] before: ${JSON.stringify(adapter.info())}`);

  const stepStart = performance.now();
  for (let i = 0; i < 60; i += 1) adapter.step();
  const stepMs = performance.now() - stepStart;

  const cubePos = adapter.getBodyTranslation(cube);
  const ballPos = adapter.getBodyTranslation(ball);
  const capsulePos = adapter.getBodyTranslation(capsule);

  console.log(`[adapter-spike] 60 steps took ${stepMs.toFixed(2)} ms`);
  console.log(`[adapter-spike] cube    y=${cubePos?.[1].toFixed(3)}`);
  console.log(`[adapter-spike] ball    y=${ballPos?.[1].toFixed(3)}`);
  console.log(`[adapter-spike] capsule y=${capsulePos?.[1].toFixed(3)}`);

  // Lifecycle: release everything + dispose.
  adapter.releaseBody(cube);
  adapter.releaseBody(ball);
  adapter.releaseBody(capsule);
  adapter.releaseBody(ground);
  console.log(`[adapter-spike] after release: ${JSON.stringify(adapter.info())}`);
  adapter.dispose();
}

void main();
