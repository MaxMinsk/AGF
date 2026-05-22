// S109 KABOOM-MULTIPLAYER-FOUNDATION — remote-bomber interpolator
// unit tests. Pure-helper coverage + a minimal end-to-end check that
// the system writes Transform.position.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  createKaboomRemoteBomberInterpolatorSystem,
  interpolateRemotePosition
} from "../../src/systems/remote-bomber-interpolator-system";
import type { SnapshotSample } from "../../../../engine/runtime/network/ws-network-adapter";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

const samples = (specs: Array<[number, number, number, number]>): ReadonlyArray<SnapshotSample> =>
  specs.map(([t, x, y, z]) => ({ receivedAtSeconds: t, position: [x, y, z] }));

describe("interpolateRemotePosition (S109 pure helper)", () => {
  it("returns undefined for empty buffer", () => {
    expect(interpolateRemotePosition([], 1.0, 0.2)).toBeUndefined();
  });

  it("returns the only sample when buffer has length 1", () => {
    const s = samples([[5, 1, 2, 3]]);
    expect(interpolateRemotePosition(s, 5, 0.2)).toEqual([1, 2, 3]);
  });

  it("lerps between bracketing samples at midpoint", () => {
    const s = samples([[0, 0, 0, 0], [1, 10, 0, 10]]);
    const got = interpolateRemotePosition(s, 0.5, 0.2);
    expect(got![0]).toBeCloseTo(5, 5);
    expect(got![1]).toBeCloseTo(0, 5);
    expect(got![2]).toBeCloseTo(5, 5);
  });

  it("extrapolates past the newest sample within the cap", () => {
    const s = samples([[0, 0, 0, 0], [1, 10, 0, 10]]);
    // 100ms past the last sample → +1 sample-span velocity × 0.1 / 1 = +1 cell.
    const got = interpolateRemotePosition(s, 1.1, 0.2);
    expect(got![0]).toBeGreaterThan(10);
    expect(got![2]).toBeGreaterThan(10);
  });

  it("holds the last position past the extrapolation cap", () => {
    const s = samples([[0, 0, 0, 0], [1, 10, 0, 10]]);
    // 500ms past the last sample — exceeds the 0.2s cap → snap to last.
    const got = interpolateRemotePosition(s, 1.5, 0.2);
    expect(got).toEqual([10, 0, 10]);
  });

  it("returns the first sample when render time is before the buffer", () => {
    const s = samples([[5, 7, 0, 7], [6, 8, 0, 8]]);
    expect(interpolateRemotePosition(s, 2, 0.2)).toEqual([7, 0, 7]);
  });
});

describe("createKaboomRemoteBomberInterpolatorSystem (S109)", () => {
  it("writes the interpolated position onto remote bombers with Presence + RemoteBomberOwned + Transform", () => {
    const world = new World();
    world.addEntity("player.bob");
    world.setComponent("player.bob", "Presence", { playerId: "bob" });
    world.setComponent("player.bob", "RemoteBomberOwned", { playerId: "bob" });
    world.setComponent("player.bob", "Transform", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });

    const buffer = new Map<string, ReadonlyArray<SnapshotSample>>([
      ["player.bob", samples([[0, 0, 0, 0], [1, 4, 0, 0]])]
    ]);
    let now = 1.05; // 50 ms past the last sample → within renderDelay (default 100 ms) → renderTime = 0.95.
    const system = createKaboomRemoteBomberInterpolatorSystem({
      localPlayerId: "alice",
      getSnapshotBuffer: () => buffer,
      nowSeconds: () => now
    });
    system.frameUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("player.bob", "Transform")!;
    expect(t.position[0]!).toBeGreaterThan(0);
    expect(t.position[0]!).toBeLessThan(4);
  });

  it("skips the local player (does not touch their Transform)", () => {
    const world = new World();
    world.addEntity("player.alice");
    world.setComponent("player.alice", "Presence", { playerId: "alice" });
    world.setComponent("player.alice", "RemoteBomberOwned", { playerId: "alice" });
    world.setComponent("player.alice", "Transform", { position: [9, 9, 9], rotation: [0, 0, 0], scale: [1, 1, 1] });

    const system = createKaboomRemoteBomberInterpolatorSystem({
      localPlayerId: "alice",
      getSnapshotBuffer: () => new Map([["player.alice", samples([[0, 0, 0, 0], [1, 4, 0, 0]])]]),
      nowSeconds: () => 1.05
    });
    system.frameUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("player.alice", "Transform")!;
    expect(t.position).toEqual([9, 9, 9]); // unchanged
  });

  it("does nothing when the entity lacks RemoteBomberOwned (decorator hasn't claimed it)", () => {
    const world = new World();
    world.addEntity("player.bob");
    world.setComponent("player.bob", "Presence", { playerId: "bob" });
    world.setComponent("player.bob", "Transform", { position: [9, 9, 9], rotation: [0, 0, 0], scale: [1, 1, 1] });
    const system = createKaboomRemoteBomberInterpolatorSystem({
      localPlayerId: "alice",
      getSnapshotBuffer: () => new Map([["player.bob", samples([[0, 0, 0, 0], [1, 4, 0, 0]])]]),
      nowSeconds: () => 1.05
    });
    system.frameUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("player.bob", "Transform")!;
    expect(t.position).toEqual([9, 9, 9]);
  });
});
