import { describe, expect, it } from "vitest";
import { createRemotePresenceInterpolatorSystem } from "../../src/systems/remote-presence-interpolator-system";
import { World } from "../../../../engine/core/ecs/world";
import type { TimeContext } from "../../../../engine/core/loop/types";
import type { SnapshotSample } from "../../../../engine/runtime/network/ws-network-adapter";

function step(world: World, opts: {
  localPlayerId: string;
  buffer: Map<string, SnapshotSample[]>;
  now: number;
  renderDelaySeconds?: number;
}): void {
  const system = createRemotePresenceInterpolatorSystem({
    localPlayerId: opts.localPlayerId,
    getSnapshotBuffer: () => opts.buffer,
    nowSeconds: () => opts.now,
    ...(opts.renderDelaySeconds !== undefined ? { renderDelaySeconds: opts.renderDelaySeconds } : {})
  });
  const time: TimeContext = {
    elapsed: opts.now,
    dt: 1 / 60,
    fixedDt: 1 / 60,
    frameCount: 0,
    fixedStepCount: 0
  };
  system.frameUpdate?.({ time, world });
}

function addServerPlayer(world: World, playerId: string, initial: [number, number, number] = [0, 0, 0]): void {
  const id = `player.${playerId}`;
  world.addEntity(id);
  world.setComponent(id, "Transform", { position: [...initial] });
  world.setComponent(id, "Presence", { playerId });
  world.setComponent(id, "Networked", { authority: "server" });
}

describe("RemotePresenceInterpolatorSystem", () => {
  it("lerps Transform.position between two samples that bracket the render time", () => {
    const world = new World();
    addServerPlayer(world, "bravo", [0, 0, 0]);

    const buffer = new Map<string, SnapshotSample[]>();
    buffer.set("player.bravo", [
      { receivedAtSeconds: 1.0, position: [0, 0, 0] },
      { receivedAtSeconds: 1.1, position: [10, 0, 0] }
    ]);

    step(world, { localPlayerId: "alpha", buffer, now: 1.15, renderDelaySeconds: 0.1 });

    const transform = world.getComponent<{ position: [number, number, number] }>(
      "player.bravo",
      "Transform"
    );
    expect(transform?.position[0]).toBeCloseTo(5, 5);
    expect(transform?.position[1]).toBe(0);
    expect(transform?.position[2]).toBe(0);
  });

  it("extrapolates linearly past the newest sample up to extrapolationLimitSeconds", () => {
    const world = new World();
    addServerPlayer(world, "bravo");
    const buffer = new Map<string, SnapshotSample[]>();
    buffer.set("player.bravo", [
      { receivedAtSeconds: 1.0, position: [0, 0, 0] },
      { receivedAtSeconds: 1.1, position: [1, 0, 0] }
    ]);

    step(world, { localPlayerId: "alpha", buffer, now: 1.25, renderDelaySeconds: 0 });

    const transform = world.getComponent<{ position: [number, number, number] }>(
      "player.bravo",
      "Transform"
    );
    expect(transform?.position[0]).toBeGreaterThan(1);
    expect(transform?.position[0]).toBeLessThanOrEqual(3);
  });

  it("holds the last known position once the extrapolation limit is exceeded", () => {
    const world = new World();
    addServerPlayer(world, "bravo");
    const buffer = new Map<string, SnapshotSample[]>();
    buffer.set("player.bravo", [
      { receivedAtSeconds: 1.0, position: [0, 0, 0] },
      { receivedAtSeconds: 1.1, position: [1, 0, 0] }
    ]);

    step(world, {
      localPlayerId: "alpha",
      buffer,
      now: 2.5,
      renderDelaySeconds: 0
    });

    const transform = world.getComponent<{ position: [number, number, number] }>(
      "player.bravo",
      "Transform"
    );
    expect(transform?.position[0]).toBe(1);
  });

  it("skips the local player's server-authority entity", () => {
    const world = new World();
    addServerPlayer(world, "alpha");
    const buffer = new Map<string, SnapshotSample[]>();
    buffer.set("player.alpha", [
      { receivedAtSeconds: 1.0, position: [0, 0, 0] },
      { receivedAtSeconds: 1.1, position: [10, 0, 0] }
    ]);

    step(world, { localPlayerId: "alpha", buffer, now: 1.15 });

    const transform = world.getComponent<{ position: [number, number, number] }>(
      "player.alpha",
      "Transform"
    );
    expect(transform?.position).toEqual([0, 0, 0]);
  });

  it("does nothing when the buffer is empty for an entity", () => {
    const world = new World();
    addServerPlayer(world, "bravo", [3, 0, 0]);
    const buffer = new Map<string, SnapshotSample[]>();

    step(world, { localPlayerId: "alpha", buffer, now: 1.5 });

    const transform = world.getComponent<{ position: [number, number, number] }>(
      "player.bravo",
      "Transform"
    );
    expect(transform?.position).toEqual([3, 0, 0]);
  });
});
