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
    expect(onEvent).toHaveBeenCalledWith("bomb-place", expect.objectContaining({ entityId: "bomb.1" }));
  });

  it("emits 'blast' when a BlastEvent transient is in flight", () => {
    const world = new World();
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    world.addEntity("evt.1");
    world.setComponent("evt.1", "BlastEvent", { originGx: 0, originGz: 0, range: 1, ownerId: "p" });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("blast", expect.anything());
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
    expect(onEvent).toHaveBeenCalledWith("death", expect.objectContaining({ entityId: "p" }));
  });

  it("S137 KABOOM-DEATH-DUST-PUFF: death edge spawns both a glow puff + spark dust burst", () => {
    const world = new World();
    world.addEntity("p");
    world.setComponent("p", "BomberStats", { maxBombs: 1, range: 2, alive: true });
    world.setComponent("p", "GridPosition", { gx: 4, gz: 7 });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    world.setComponent("p", "BomberStats", { maxBombs: 1, range: 2, alive: false });
    system.fixedUpdate!(ctx(world));
    // Glow puff — the lingering aura from S86.
    expect(world.hasEntity("p.death-puff")).toBe(true);
    const puffEmitter = world.getComponent<{ preset?: string; lifetime?: number }>("p.death-puff", "ParticleEmitter");
    expect(puffEmitter?.preset).toBe("glow");
    expect(puffEmitter?.lifetime).toBeCloseTo(0.5, 5);
    // Dust spark — the new S137 burst.
    expect(world.hasEntity("p.death-dust")).toBe(true);
    const dustEmitter = world.getComponent<{ preset?: string; lifetime?: number; maxParticles?: number }>("p.death-dust", "ParticleEmitter");
    expect(dustEmitter?.preset).toBe("spark");
    expect(dustEmitter?.lifetime).toBeCloseTo(0.35, 5);
    expect(dustEmitter?.maxParticles).toBe(24);
    // Both emitters live at the dead bomber's cell.
    const puffT = world.getComponent<{ position?: number[] }>("p.death-puff", "Transform");
    const dustT = world.getComponent<{ position?: number[] }>("p.death-dust", "Transform");
    expect(puffT?.position).toEqual([4, 0.5, 7]);
    expect(dustT?.position).toEqual([4, 0.5, 7]);
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
    // First tick fires both 'bomb-place' AND 'voice-place-bomb' (S109).
    // Subsequent ticks see no new bomb edges → no more events.
    const bombPlace = onEvent.mock.calls.filter((args: unknown[]) => args[0] === "bomb-place");
    const voicePlace = onEvent.mock.calls.filter((args: unknown[]) => args[0] === "voice-place-bomb");
    expect(bombPlace.length).toBe(1);
    expect(voicePlace.length).toBe(1);
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

  it("S89 KABOOM-MATCH-WIN-PARTICLES: matchPhase=won spawns a pulse ParticleEmitter at the winner cell", () => {
    const world = new World();
    world.addEntity("player.1");
    world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, activeBombs: 0, alive: true });
    world.setComponent("player.1", "GridPosition", { gx: 4, gz: 5 });
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", { phase: "playing", matchPhase: "in-progress" });
    const system = createKaboomAudioBindingSystem({ onEvent: vi.fn() });
    system.fixedUpdate!(ctx(world));
    world.setComponent("kaboom.round-state", "RoundState", { phase: "won", matchPhase: "won", winnerId: "player.1" });
    system.fixedUpdate!(ctx(world));
    const puffId = "player.1.match-burst-won";
    expect(world.hasEntity(puffId)).toBe(true);
    const emitter = world.getComponent(puffId, "ParticleEmitter") as { preset: string; maxParticles: number };
    expect(emitter.preset).toBe("pulse");
    expect(emitter.maxParticles).toBe(40);
  });

  it("S89 KABOOM-MATCH-WIN-PARTICLES: matchPhase=draw spawns a burst at every BomberStats entity", () => {
    const world = new World();
    world.addEntity("player.1");
    world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, activeBombs: 0, alive: true });
    world.setComponent("player.1", "GridPosition", { gx: 1, gz: 1 });
    world.addEntity("bot.1");
    world.setComponent("bot.1", "BomberStats", { maxBombs: 1, range: 2, activeBombs: 0, alive: true });
    world.setComponent("bot.1", "GridPosition", { gx: 9, gz: 9 });
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", { phase: "playing", matchPhase: "in-progress" });
    const system = createKaboomAudioBindingSystem({ onEvent: vi.fn() });
    system.fixedUpdate!(ctx(world));
    world.setComponent("kaboom.round-state", "RoundState", { phase: "draw", matchPhase: "draw" });
    system.fixedUpdate!(ctx(world));
    expect(world.hasEntity("player.1.match-burst-draw")).toBe(true);
    expect(world.hasEntity("bot.1.match-burst-draw")).toBe(true);
  });

  it("S90 KABOOM-FOOTSTEP-TICK: a GridPosition change between ticks fires one 'footstep' event", () => {
    const world = new World();
    world.addEntity("player.1");
    world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: true });
    world.setComponent("player.1", "GridPosition", { gx: 1, gz: 1 });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    // Tick 1: first observation, no event.
    system.fixedUpdate!(ctx(world));
    expect(onEvent).not.toHaveBeenCalledWith("footstep", expect.anything());
    // Tick 2: position unchanged, still no event.
    system.fixedUpdate!(ctx(world));
    expect(onEvent).not.toHaveBeenCalledWith("footstep", expect.anything());
    // Tick 3: position changed → one event.
    world.setComponent("player.1", "GridPosition", { gx: 2, gz: 1 });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("footstep", expect.objectContaining({ entityId: "player.1" }));
  });

  it("S90 KABOOM-FOOTSTEP-TICK: dead bombers don't tick", () => {
    const world = new World();
    world.addEntity("player.1");
    world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: false });
    world.setComponent("player.1", "GridPosition", { gx: 1, gz: 1 });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    world.setComponent("player.1", "GridPosition", { gx: 2, gz: 1 });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).not.toHaveBeenCalledWith("footstep", expect.anything());
  });

  it("S91 KABOOM-AUDIO-POSITIONAL-ADOPT: footstep carries the bomber's [gx,0,gz] position", () => {
    const world = new World();
    world.addEntity("player.1");
    world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: true });
    world.setComponent("player.1", "GridPosition", { gx: 4, gz: 7 });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    world.setComponent("player.1", "GridPosition", { gx: 5, gz: 7 });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("footstep", expect.objectContaining({ entityId: "player.1", position: [5, 0, 7] }));
  });

  it("S91 KABOOM-AUDIO-POSITIONAL-ADOPT: bomb-place carries the bomb's [gx,0,gz] position", () => {
    const world = new World();
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    world.addEntity("bomb.1");
    world.setComponent("bomb.1", "Bomb", { fuseRemaining: 2.5, range: 2, ownerId: "p" });
    world.setComponent("bomb.1", "GridPosition", { gx: 3, gz: 2 });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("bomb-place", expect.objectContaining({ entityId: "bomb.1", position: [3, 0, 2] }));
  });

  it("S91 KABOOM-AUDIO-POSITIONAL-ADOPT: blast carries the BlastEvent origin", () => {
    const world = new World();
    world.addEntity("evt.1");
    world.setComponent("evt.1", "BlastEvent", { originGx: 9, originGz: 5, range: 1, ownerId: "p" });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("blast", expect.objectContaining({ position: [9, 0, 5] }));
  });

  it("S91 KABOOM-AUDIO-POSITIONAL-ADOPT: match-* chimes do NOT carry a position", () => {
    const world = new World();
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", { phase: "playing", matchPhase: "in-progress" });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    world.setComponent("kaboom.round-state", "RoundState", { phase: "won", matchPhase: "won" });
    system.fixedUpdate!(ctx(world));
    const wonCall = onEvent.mock.calls.find((c) => c[0] === "match-won");
    expect(wonCall?.[1]).toBeUndefined();
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

  // S109 KABOOM-PROCEDURAL-VOCAL-SYNTH — per-bomber voice events fire
  // alongside the existing audio events on the right gameplay edges.

  it("S109: emits 'voice-place-bomb' tagged with the bomb's ownerId", () => {
    const world = new World();
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    world.addEntity("bomb.1");
    world.setComponent("bomb.1", "Bomb", { fuseRemaining: 2.5, range: 2, ownerId: "player.1" });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("voice-place-bomb", expect.objectContaining({ entityId: "player.1" }));
  });

  it("S109: emits 'voice-hit' when a shielded bomber survives a blast (shield true→false, alive stays true)", () => {
    const world = new World();
    world.addEntity("p");
    world.setComponent("p", "BomberStats", { maxBombs: 1, range: 2, alive: true, shield: true });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    world.setComponent("p", "BomberStats", { maxBombs: 1, range: 2, alive: true, shield: false });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("voice-hit", expect.objectContaining({ entityId: "p" }));
  });

  it("S109: does NOT emit 'voice-hit' when the shield consumes and the bomber ALSO dies in the same step", () => {
    const world = new World();
    world.addEntity("p");
    world.setComponent("p", "BomberStats", { maxBombs: 1, range: 2, alive: true, shield: true });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    world.setComponent("p", "BomberStats", { maxBombs: 1, range: 2, alive: false, shield: false });
    system.fixedUpdate!(ctx(world));
    // voice-death fires; voice-hit does NOT (alive went to false).
    const voiceHitCalls = onEvent.mock.calls.filter((args: unknown[]) => args[0] === "voice-hit");
    expect(voiceHitCalls.length).toBe(0);
    expect(onEvent).toHaveBeenCalledWith("voice-death", expect.objectContaining({ entityId: "p" }));
  });

  it("S109: emits 'voice-death' on alive true→false", () => {
    const world = new World();
    world.addEntity("p");
    world.setComponent("p", "BomberStats", { maxBombs: 1, range: 2, alive: true });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    world.setComponent("p", "BomberStats", { maxBombs: 1, range: 2, alive: false });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("voice-death", expect.objectContaining({ entityId: "p" }));
  });

  it("S109: emits 'voice-pickup' when BomberStats stats sum increases (pickup-collect application)", () => {
    const world = new World();
    world.addEntity("p");
    world.setComponent("p", "BomberStats", { maxBombs: 1, range: 2, alive: true });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    // PickupCollectSystem applies a bomb-up: maxBombs goes from 1 → 2.
    world.setComponent("p", "BomberStats", { maxBombs: 2, range: 2, alive: true });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("voice-pickup", expect.objectContaining({ entityId: "p" }));
  });

  it("S109: emits 'voice-victory' for the winner on match-won (winnerId from RoundState)", () => {
    const world = new World();
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", { phase: "playing", matchPhase: "in-progress" });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    world.setComponent("kaboom.round-state", "RoundState", { phase: "won", matchPhase: "won", winnerId: "player.1" });
    system.fixedUpdate!(ctx(world));
    expect(onEvent).toHaveBeenCalledWith("voice-victory", expect.objectContaining({ entityId: "player.1" }));
  });

  it("S109: does NOT emit 'voice-victory' on a draw (no winnerId)", () => {
    const world = new World();
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", { phase: "playing", matchPhase: "in-progress" });
    const onEvent = vi.fn();
    const system = createKaboomAudioBindingSystem({ onEvent });
    system.fixedUpdate!(ctx(world));
    world.setComponent("kaboom.round-state", "RoundState", { phase: "draw", matchPhase: "draw" });
    system.fixedUpdate!(ctx(world));
    const voiceVictoryCalls = onEvent.mock.calls.filter((args: unknown[]) => args[0] === "voice-victory");
    expect(voiceVictoryCalls.length).toBe(0);
  });

  // S267 — step-jump audio edge detection.
  describe("S267 KABOOM-STEP-JUMP-AUDIO", () => {
    function setupBomberOnHeightmap(
      world: World,
      bomberId: string,
      heights: number[][]
    ): void {
      world.addEntity("grid.config");
      world.setComponent("grid.config", "Grid", { sizeX: 4, sizeZ: 4, cellSize: 1 });
      world.setComponent("grid.config", "Heightmap", { values: heights });
      world.addEntity(bomberId);
      world.setComponent(bomberId, "BomberStats", { maxBombs: 1, range: 2, alive: true });
      world.setComponent(bomberId, "GridPosition", { gx: 0, gz: 0 });
      world.setComponent(bomberId, "GridMover", { speed: 4, currentLerp: 0 });
    }

    it("fires step-jump-launch on the 0 → mid-tween edge over a delta=1 cliff", () => {
      const world = new World();
      // Heights: [0][0]=0, [0][1]=1 → step up of 1 cell east.
      setupBomberOnHeightmap(world, "bot.j", [[0, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
      const onEvent = vi.fn();
      const system = createKaboomAudioBindingSystem({ onEvent });
      // Tick 1: stationary.
      system.fixedUpdate!(ctx(world));
      onEvent.mockClear();
      // Tick 2: start tween from (0,0) → (1,0). currentLerp 0.5.
      world.setComponent("bot.j", "GridMover", { speed: 4, currentLerp: 0.5, targetGx: 1, targetGz: 0 });
      system.fixedUpdate!(ctx(world));
      const launches = onEvent.mock.calls.filter((args: unknown[]) => args[0] === "step-jump-launch");
      expect(launches.length).toBe(1);
    });

    it("fires step-jump-land on the mid-tween → done edge", () => {
      const world = new World();
      setupBomberOnHeightmap(world, "bot.j", [[0, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
      const onEvent = vi.fn();
      const system = createKaboomAudioBindingSystem({ onEvent });
      world.setComponent("bot.j", "GridMover", { speed: 4, currentLerp: 0.5, targetGx: 1, targetGz: 0 });
      system.fixedUpdate!(ctx(world));
      onEvent.mockClear();
      // Tick complete: lerp cleared, GridPosition snaps to (1,0).
      world.setComponent("bot.j", "GridMover", { speed: 4, currentLerp: 0 });
      world.setComponent("bot.j", "GridPosition", { gx: 1, gz: 0 });
      system.fixedUpdate!(ctx(world));
      const lands = onEvent.mock.calls.filter((args: unknown[]) => args[0] === "step-jump-land");
      expect(lands.length).toBe(1);
    });

    it("does NOT fire on a flat-cell tween (no height delta)", () => {
      const world = new World();
      setupBomberOnHeightmap(world, "bot.j", [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
      const onEvent = vi.fn();
      const system = createKaboomAudioBindingSystem({ onEvent });
      system.fixedUpdate!(ctx(world));
      onEvent.mockClear();
      world.setComponent("bot.j", "GridMover", { speed: 4, currentLerp: 0.5, targetGx: 1, targetGz: 0 });
      system.fixedUpdate!(ctx(world));
      const allKinds = onEvent.mock.calls.map((args: unknown[]) => args[0]);
      expect(allKinds).not.toContain("step-jump-launch");
      expect(allKinds).not.toContain("step-jump-land");
    });

    it("stepJumpAudioEnabled=false suppresses both events", () => {
      const world = new World();
      setupBomberOnHeightmap(world, "bot.j", [[0, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
      const onEvent = vi.fn();
      const system = createKaboomAudioBindingSystem({ onEvent, stepJumpAudioEnabled: false });
      system.fixedUpdate!(ctx(world));
      world.setComponent("bot.j", "GridMover", { speed: 4, currentLerp: 0.5, targetGx: 1, targetGz: 0 });
      system.fixedUpdate!(ctx(world));
      world.setComponent("bot.j", "GridMover", { speed: 4, currentLerp: 0 });
      world.setComponent("bot.j", "GridPosition", { gx: 1, gz: 0 });
      system.fixedUpdate!(ctx(world));
      const allKinds = onEvent.mock.calls.map((args: unknown[]) => args[0]);
      expect(allKinds).not.toContain("step-jump-launch");
      expect(allKinds).not.toContain("step-jump-land");
    });
  });
});
