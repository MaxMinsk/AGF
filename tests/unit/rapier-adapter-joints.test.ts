// S127 — rapier-adapter joint API integration tests. Spins up a real
// Rapier instance (WASM) + a real adapter, then verifies the new
// joint surface actually constrains body motion.

import { describe, expect, it } from "vitest";

import {
  createRapierAdapter,
  type BodyHandle,
  type RapierAdapter
} from "../../engine/physics/rapier/rapier-adapter";

async function setup(): Promise<RapierAdapter> {
  const adapter = await createRapierAdapter({ gravity: [0, 0, 0], fixedDt: 1 / 60 });
  return adapter;
}

describe("rapier-adapter joints (S127)", () => {
  it("fixed joint keeps two dynamic bodies in lock-step under an impulse", async () => {
    const adapter = await setup();
    const a: BodyHandle = adapter.acquireBody({ kind: "dynamic", position: [0, 0, 0] });
    const b: BodyHandle = adapter.acquireBody({ kind: "dynamic", position: [1, 0, 0] });
    // Add tiny colliders so Rapier knows the bodies have inertia.
    adapter.acquireCollider(a, { kind: "sphere", radius: 0.1 });
    adapter.acquireCollider(b, { kind: "sphere", radius: 0.1 });
    const joint = adapter.acquireJoint(a, b, {
      type: "fixed",
      anchorA: [0.5, 0, 0],
      anchorB: [-0.5, 0, 0]
    });
    expect(joint).toBeDefined();

    // Kick body A in +X. Both bodies should move together (joint locks).
    adapter.applyImpulse(a, [10, 0, 0]);
    for (let i = 0; i < 30; i += 1) adapter.step(1 / 60);
    const posA = adapter.getBodyTranslation(a)!;
    const posB = adapter.getBodyTranslation(b)!;
    expect(posA[0]).toBeGreaterThan(0.1);
    // Joint keeps them roughly the same distance apart (1 cell).
    expect(Math.abs(posB[0] - posA[0])).toBeCloseTo(1, 0);
    adapter.dispose();
  });

  it("releaseJoint frees the constraint — bodies become independent", async () => {
    const adapter = await setup();
    const a = adapter.acquireBody({ kind: "dynamic", position: [0, 0, 0] });
    const b = adapter.acquireBody({ kind: "dynamic", position: [1, 0, 0] });
    adapter.acquireCollider(a, { kind: "sphere", radius: 0.1 });
    adapter.acquireCollider(b, { kind: "sphere", radius: 0.1 });
    const joint = adapter.acquireJoint(a, b, {
      type: "fixed",
      anchorA: [0.5, 0, 0],
      anchorB: [-0.5, 0, 0]
    })!;
    adapter.releaseJoint(joint);
    // Kick only body A — body B should NOT follow since the joint is gone.
    adapter.applyImpulse(a, [10, 0, 0]);
    for (let i = 0; i < 30; i += 1) adapter.step(1 / 60);
    const posA = adapter.getBodyTranslation(a)!;
    const posB = adapter.getBodyTranslation(b)!;
    // Body A moved noticeably; body B barely moved.
    expect(posA[0]).toBeGreaterThan(0.5);
    expect(Math.abs(posB[0] - 1)).toBeLessThan(0.05);
    adapter.dispose();
  });

  it("ball joint allows free rotation while keeping anchors together", async () => {
    const adapter = await setup();
    const a = adapter.acquireBody({ kind: "fixed", position: [0, 0, 0] });
    const b = adapter.acquireBody({ kind: "dynamic", position: [1, 0, 0] });
    adapter.acquireCollider(a, { kind: "sphere", radius: 0.1 });
    adapter.acquireCollider(b, { kind: "sphere", radius: 0.1 });
    adapter.acquireJoint(a, b, {
      type: "ball",
      anchorA: [0.5, 0, 0],
      anchorB: [-0.5, 0, 0]
    });
    // Apply an upward impulse to body B — it should rotate around the
    // fixed body A but stay tethered.
    adapter.applyImpulse(b, [0, 5, 0]);
    for (let i = 0; i < 60; i += 1) adapter.step(1 / 60);
    const posA = adapter.getBodyTranslation(a)!;
    const posB = adapter.getBodyTranslation(b)!;
    const dist = Math.hypot(posB[0] - posA[0], posB[1] - posA[1], posB[2] - posA[2]);
    // Distance should stay close to 1 (the anchor offset sum).
    expect(dist).toBeCloseTo(1, 0);
    adapter.dispose();
  });
});
