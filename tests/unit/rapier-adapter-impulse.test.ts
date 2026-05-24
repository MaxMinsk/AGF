// S127 — rapier-adapter impulse + velocity tests.

import { describe, expect, it } from "vitest";

import { createRapierAdapter } from "../../engine/physics/rapier/rapier-adapter";

describe("rapier-adapter impulse + velocity (S127)", () => {
  it("applyImpulse([0, 10, 0]) makes a body fly upward", async () => {
    const adapter = await createRapierAdapter({ gravity: [0, 0, 0], fixedDt: 1 / 60 });
    const body = adapter.acquireBody({ kind: "dynamic", position: [0, 0, 0] });
    adapter.acquireCollider(body, { kind: "sphere", radius: 0.1 });
    adapter.applyImpulse(body, [0, 10, 0]);
    for (let i = 0; i < 30; i += 1) adapter.step(1 / 60);
    const pos = adapter.getBodyTranslation(body)!;
    expect(pos[1]).toBeGreaterThan(1);
    adapter.dispose();
  });

  it("setLinvel([5, 0, 0]) advances the body each step", async () => {
    const adapter = await createRapierAdapter({ gravity: [0, 0, 0], fixedDt: 1 / 60 });
    const body = adapter.acquireBody({ kind: "dynamic", position: [0, 0, 0] });
    adapter.acquireCollider(body, { kind: "sphere", radius: 0.1 });
    adapter.setLinvel(body, [5, 0, 0]);
    for (let i = 0; i < 12; i += 1) adapter.step(1 / 60); // 12 frames at 60 Hz → 0.2 s → ~1 cell
    const pos = adapter.getBodyTranslation(body)!;
    expect(pos[0]).toBeGreaterThan(0.8);
    expect(pos[0]).toBeLessThan(1.2);
    adapter.dispose();
  });

  it("applyTorqueImpulse rotates the body without translating it", async () => {
    const adapter = await createRapierAdapter({ gravity: [0, 0, 0], fixedDt: 1 / 60 });
    const body = adapter.acquireBody({ kind: "dynamic", position: [0, 0, 0] });
    adapter.acquireCollider(body, { kind: "box", size: [0.3, 0.3, 0.3] });
    adapter.applyTorqueImpulse(body, [0, 0.5, 0]);
    for (let i = 0; i < 30; i += 1) adapter.step(1 / 60);
    const pos = adapter.getBodyTranslation(body)!;
    const rot = adapter.getBodyRotation(body)!;
    // Translation stays near origin.
    expect(Math.abs(pos[0])).toBeLessThan(0.05);
    expect(Math.abs(pos[2])).toBeLessThan(0.05);
    // Quaternion no longer identity (some Y rotation).
    const identityScore = Math.abs(rot[0]) + Math.abs(rot[1]) + Math.abs(rot[2]);
    expect(identityScore).toBeGreaterThan(0.05);
    adapter.dispose();
  });
});
