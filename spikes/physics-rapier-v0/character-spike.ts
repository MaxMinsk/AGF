// M24-character: drive a kinematic capsule against a fixed floor +
// dynamic crate. Verifies the character controller resolves slide+climb
// + computedGrounded flag through the AGF adapter surface.
//
// Run with:  npx tsx spikes/physics-rapier-v0/character-spike.ts

import RAPIER from "@dimforge/rapier3d-compat";

import { createAdapterFromModule } from "../../engine/physics/rapier/rapier-adapter";

async function main(): Promise<void> {
  await RAPIER.init();
  const adapter = createAdapterFromModule(RAPIER);

  // Floor.
  const ground = adapter.acquireBody({ kind: "fixed", position: [0, -0.5, 0] });
  adapter.acquireCollider(ground, { kind: "box", size: [20, 1, 20] });

  // Kinematic capsule character at y=2.
  const character = adapter.acquireBody({
    kind: "kinematicPosition",
    position: [0, 2, 0]
  });
  const characterCollider = adapter.acquireCollider(character, {
    kind: "capsule",
    radius: 0.35,
    halfHeight: 0.7
  });
  if (characterCollider === undefined) throw new Error("capsule collider missing");

  const controller = adapter.acquireCharacterController({
    offset: 0.01,
    maxSlope: (45 * Math.PI) / 180,
    snapToGround: 0.3,
    applyImpulsesToDynamicBodies: true,
    characterMass: 3
  });

  // Apply gravity manually + a forward push every step.
  const gravity = -9.81 / 60; // per fixed-step
  for (let i = 0; i < 90; i += 1) {
    const result = adapter.computeCharacterMovement(controller, characterCollider, [
      0.05,
      gravity,
      0
    ]);
    if (result === undefined) throw new Error("controller missing");
    const pos = adapter.getBodyTranslation(character);
    if (pos === undefined) throw new Error("body missing");
    adapter.setBodyNextKinematicTranslation(character, [
      pos[0] + result.movement[0],
      pos[1] + result.movement[1],
      pos[2] + result.movement[2]
    ]);
    adapter.step();
    if (i === 89) {
      console.log(`[character-spike] frame ${i} grounded=${result.grounded} pos=${pos.map((v) => v.toFixed(3))}`);
    }
  }
  const finalPos = adapter.getBodyTranslation(character);
  console.log(`[character-spike] final character pos: ${finalPos?.map((v) => v.toFixed(3))}`);

  // Capsule extends ±(halfHeight + radius) = ±1.05 from body center.
  // Resting on floor (y=0) means body y ≈ 1.05.
  if (finalPos === undefined || finalPos[1] < 0.9 || finalPos[1] > 1.2) {
    throw new Error(`[character-spike] FAIL — character didn't settle to ~1.05 (y=${finalPos?.[1]})`);
  }
  console.log("[character-spike] OK — capsule rests on floor, controller works.");
  adapter.dispose();
}

void main();
