// S84 KABOOM-AUDIO-WIRE.

import { describe, expect, it, vi } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomAudioBindingSystem } from "../../src/systems/audio-binding-system";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

describe("createKaboomAudioBindingSystem (S84 KABOOM-AUDIO-WIRE)", () => {
  it("emits 'bomb-place' when a new Bomb entity appears", () => {
    const world = new World();
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    // Tick 1: nothing.
    system.fixedUpdate!(ctx(world));
    expect(onEvent).not.toHaveBeenCalled();
    // Tick 2: a bomb spawns.
    world.addEntity("bomb.1");
    world.setComponent("bomb.1", "Bomb", { fuseRemaining: 2.5, range: 2, ownerId: "p" });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("bomb-place", { entityId: "bomb.1" });
  });

  it("emits 'blast' when a BlastEvent transient is in flight", () => {
    const world = new World();
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    world.addEntity("evt.1");
    world.setComponent("evt.1", "BlastEvent", { originGx: 0, originGz: 0, range: 1, ownerId: "p" });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("blast");
  });

  it("emits 'pickup' when a Pickup entity disappears", () => {
    const world = new World();
    world.addEntity("pickup.1");
    world.setComponent("pickup.1", "Pickup", { kind: "bomb-up" });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    // Tick 1: pickup observed → no event.
    system.fixedUpdate!(ctx(world));
    expect(onEvent).not.toHaveBeenCalled();
    // Tick 2: pickup removed → event.
    world.removeEntity("pickup.1");
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("pickup", { entityId: "pickup.1" });
  });

  it("emits 'death' when BomberStats.alive flips true → false", () => {
    const world = new World();
    world.addEntity("p");
    world.setComponent("p", "BomberStats", { maxBombs: 1, range: 2, alive: true });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).not.toHaveBeenCalled();
    world.setComponent("p", "BomberStats", { maxBombs: 1, range: 2, alive: false });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("death", { entityId: "p" });
  });

  it("doesn't re-emit on subsequent frames with the same world state", () => {
    const world = new World();
    world.addEntity("bomb.1");
    world.setComponent("bomb.1", "Bomb", { fuseRemaining: 2.5, range: 2, ownerId: "p" });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    system.fixedUpdate!(ctx(world));
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledTimes(1); // only the first tick saw the new bomb
  });

  it("resets snapshots on world swap (scene.load)", () => {
    const worldA = new World();
    worldA.addEntity("pickup.alpha");
    worldA.setComponent("pickup.alpha", "Pickup", { kind: "bomb-up" });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(worldA));
    // Switch to a fresh world (simulates scene.load).
    const worldB = new World();
    system.fixedUpdate!(ctx(worldB));
    // The pickup that "vanished" in worldA must NOT trigger an event
    // — that wasn't a collect, just a world reset.
    expect(onEvent).not.toHaveBeenCalledWith("pickup", expect.anything());
  });

  it("S88 KABOOM-WIN-CHIME: matchPhase transitioning to 'won' fires 'match-won' once", () => {
    const world = new World();
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", { phase: "playing", matchPhase: "in-progress" });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).not.toHaveBeenCalledWith("match-won");
    world.setComponent("kaboom.round-state", "RoundState", { phase: "won", matchPhase: "won" });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("match-won");
    const calls = onEvent.mock.calls.filter((c) => c[0] === "match-won").length;
    system.fixedUpdate!(ctx(world));
    expect(onEvent.mock.calls.filter((c) => c[0] === "match-won").length).toBe(calls);
  });

  it("S88 KABOOM-WIN-CHIME: matchPhase=lost fires 'match-lost'", () => {
    const world = new World();
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", { phase: "playing", matchPhase: "in-progress" });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    world.setComponent("kaboom.round-state", "RoundState", { phase: "lost", matchPhase: "lost" });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("match-lost");
  });

  it("S88 KABOOM-WIN-CHIME: matchPhase=draw fires 'match-draw'", () => {
    const world = new World();
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", { phase: "playing", matchPhase: "in-progress" });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    world.setComponent("kaboom.round-state", "RoundState", { phase: "draw", matchPhase: "draw" });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("match-draw");
  });
});
