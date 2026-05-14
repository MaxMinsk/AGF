// M24-raycast: end-to-end raycast through the AGF adapter surface.
// Builds a small scene (ground + offset box), shoots a ray straight
// down, asserts it hits the ground at the expected distance, then
// shoots a ray from outside the ground that misses.
//
// Run with:  npx tsx spikes/physics-rapier-v0/raycast-spike.ts

import RAPIER from "@dimforge/rapier3d-compat";

import { createAdapterFromModule } from "../../engine/physics/rapier/rapier-adapter";

async function main(): Promise<void> {
  await RAPIER.init();
  const adapter = createAdapterFromModule(RAPIER);

  // Ground at y=-0.5, top face at y=0.
  const ground = adapter.acquireBody({ kind: "fixed", position: [0, -0.5, 0] });
  const groundCollider = adapter.acquireCollider(ground, {
    kind: "box",
    size: [20, 1, 20]
  });
  if (groundCollider === undefined) throw new Error("ground collider failed");

  // Offset cube center y=1.
  const cube = adapter.acquireBody({ kind: "fixed", position: [5, 1, 0] });
  const cubeCollider = adapter.acquireCollider(cube, {
    kind: "box",
    size: [1, 2, 1]
  });
  if (cubeCollider === undefined) throw new Error("cube collider failed");

  // Step once so the broadphase indexes the new colliders.
  adapter.step();

  // 1. Vertical ray from (0, 10, 0) down should hit ground top face
  //    at y=0 (distance 10).
  const hitDown = adapter.castRay([0, 10, 0], [0, -1, 0], 50);
  if (hitDown === undefined) throw new Error("ray down missed ground");
  console.log(
    `[raycast-spike] vertical hit: distance=${hitDown.distance.toFixed(2)} ` +
      `point=${hitDown.point.map((v) => v.toFixed(2))} ` +
      `normal=${hitDown.normal.map((v) => v.toFixed(2))}`
  );
  if (hitDown.collider !== groundCollider) {
    throw new Error(
      `expected ground collider ${groundCollider}, got ${hitDown.collider}`
    );
  }
  if (hitDown.distance < 9.9 || hitDown.distance > 10.1) {
    throw new Error(`expected distance ~10, got ${hitDown.distance}`);
  }
  if (hitDown.normal[1] < 0.99) {
    throw new Error(`expected upward normal, got y=${hitDown.normal[1]}`);
  }

  // 2. Horizontal ray from (0, 1, 0) toward the cube should hit the
  //    cube's left face at x=4.5 (distance 4.5).
  const hitSide = adapter.castRay([0, 1, 0], [1, 0, 0], 20);
  if (hitSide === undefined) throw new Error("ray side missed cube");
  console.log(
    `[raycast-spike] sideways hit: distance=${hitSide.distance.toFixed(2)} ` +
      `point=${hitSide.point.map((v) => v.toFixed(2))} ` +
      `collider=${hitSide.collider}`
  );
  if (hitSide.collider !== cubeCollider) {
    throw new Error(
      `expected cube collider ${cubeCollider}, got ${hitSide.collider}`
    );
  }
  if (hitSide.distance < 4.4 || hitSide.distance > 4.6) {
    throw new Error(`expected distance ~4.5, got ${hitSide.distance}`);
  }

  // 3. Ray pointing away from everything should miss.
  const miss = adapter.castRay([100, 100, 100], [0, 1, 0], 10);
  if (miss !== undefined) {
    throw new Error(`expected miss, got hit at distance ${miss.distance}`);
  }
  console.log("[raycast-spike] miss as expected (returned undefined).");

  console.log("[raycast-spike] OK");
  adapter.dispose();
}

void main();
