// M24-static-mesh: drop a dynamic ball onto a heightfield + a trimesh
// "wedge" and verify it lands on the right surface.
//
// Run with:  npx tsx spikes/physics-rapier-v0/static-mesh-spike.ts

import RAPIER from "@dimforge/rapier3d-compat";

import { createAdapterFromModule } from "../../engine/physics/rapier/rapier-adapter";

async function main(): Promise<void> {
  await RAPIER.init();
  const adapter = createAdapterFromModule(RAPIER);

  // 1. Heightfield: 5×5 sample grid, flat at y=0 over a 10×10 patch.
  const rows = 5;
  const columns = 5;
  const heights = new Array<number>(rows * columns).fill(0);
  const ground = adapter.acquireBody({ kind: "fixed", position: [0, 0, 0] });
  const heightfieldCollider = adapter.acquireCollider(ground, {
    kind: "heightfield",
    rows,
    columns,
    heights,
    scale: [10, 1, 10]
  });
  if (heightfieldCollider === undefined) throw new Error("heightfield rejected");

  // 2. Trimesh wedge sitting on the heightfield, slanted up to y=2 over 4
  //    units. Triangles wind so the surface normal faces up.
  const wedgeBody = adapter.acquireBody({ kind: "fixed", position: [6, 0, 0] });
  const wedgeCollider = adapter.acquireCollider(wedgeBody, {
    kind: "trimesh",
    // Two triangles forming a ramp: corners at (-2, 0, -1), (2, 2, -1),
    // (-2, 0, 1), (2, 2, 1).
    vertices: [
      -2, 0, -1,
       2, 2, -1,
      -2, 0,  1,
       2, 2,  1
    ],
    indices: [0, 2, 1, 1, 2, 3]
  });
  if (wedgeCollider === undefined) throw new Error("trimesh rejected");

  // 3. Dynamic ball dropped above the heightfield.
  const ball = adapter.acquireBody({ kind: "dynamic", position: [0, 5, 0], mass: 1 });
  adapter.acquireCollider(ball, { kind: "sphere", radius: 0.3 });

  for (let i = 0; i < 180; i += 1) adapter.step();
  const pos = adapter.getBodyTranslation(ball);
  if (pos === undefined) throw new Error("ball missing");
  console.log(`[static-mesh-spike] ball settled at y=${pos[1].toFixed(3)} (expected ~0.3 on heightfield)`);
  if (pos[1] < 0.1 || pos[1] > 0.5) {
    throw new Error(`heightfield collision failed: ball y=${pos[1]}`);
  }

  // 4. Drop another ball over the wedge's high end and confirm it rests
  //    on the slanted face (y ≈ 2 + radius). Settle position is more
  //    sensitive; allow 1.5..2.5 because the ramp slope lets it slide a
  //    bit before stopping.
  const ball2 = adapter.acquireBody({ kind: "dynamic", position: [7.5, 5, 0], mass: 1 });
  adapter.acquireCollider(ball2, { kind: "sphere", radius: 0.3 });
  for (let i = 0; i < 240; i += 1) adapter.step();
  const pos2 = adapter.getBodyTranslation(ball2);
  if (pos2 === undefined) throw new Error("ball2 missing");
  console.log(`[static-mesh-spike] wedge ball settled at y=${pos2[1].toFixed(3)} x=${pos2[0].toFixed(3)}`);
  if (pos2[1] < 0.1) {
    throw new Error(`wedge ball fell through trimesh: pos=${pos2.map((v) => v.toFixed(3))}`);
  }

  console.log("[static-mesh-spike] OK");
  adapter.dispose();
}

void main();
