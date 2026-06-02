// S260 — direct unit tests for the spawn-puff helper. Locks the
// idempotency contract + the color-override branch so future puff
// sites can rely on a stable surface.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { spawnPuff } from "../../src/systems/spawn-puff";

describe("spawnPuff (S247 KABOOM-PUFF-HELPER)", () => {
  it("creates a child entity with Transform + ParticleEmitter at the requested position", () => {
    const world = new World();
    spawnPuff(world, {
      id: "p.test.1",
      position: [3, 0.5, 7],
      preset: "spark",
      lifetime: 0.3,
      rate: 30,
      maxParticles: 8
    });
    expect(world.hasEntity("p.test.1")).toBe(true);
    const transform = world.getComponent("p.test.1", "Transform") as {
      position: ReadonlyArray<number>;
      rotation: ReadonlyArray<number>;
      scale: ReadonlyArray<number>;
    };
    expect(transform.position).toEqual([3, 0.5, 7]);
    expect(transform.rotation).toEqual([0, 0, 0]);
    expect(transform.scale).toEqual([1, 1, 1]);
    const emitter = world.getComponent("p.test.1", "ParticleEmitter") as {
      preset: string;
      lifetime: number;
      elapsed: number;
      rate: number;
      maxParticles: number;
      color?: string;
    };
    expect(emitter.preset).toBe("spark");
    expect(emitter.lifetime).toBe(0.3);
    expect(emitter.elapsed).toBe(0);
    expect(emitter.rate).toBe(30);
    expect(emitter.maxParticles).toBe(8);
    expect(emitter.color).toBeUndefined();
  });

  it("is idempotent — a second call with the same id is a silent no-op", () => {
    const world = new World();
    spawnPuff(world, {
      id: "p.dup",
      position: [0, 0, 0],
      preset: "spark",
      lifetime: 0.3,
      rate: 30,
      maxParticles: 8
    });
    // Capture the first emitter ref (object identity may not hold but
    // the lifetime should stay at 0.3 after the second call).
    spawnPuff(world, {
      id: "p.dup",
      position: [99, 99, 99], // would-be different position
      preset: "glow",
      lifetime: 0.99,
      rate: 999,
      maxParticles: 99
    });
    const t = world.getComponent("p.dup", "Transform") as { position: ReadonlyArray<number> };
    expect(t.position).toEqual([0, 0, 0]); // unchanged — second call was a no-op
    const e = world.getComponent("p.dup", "ParticleEmitter") as { preset: string; lifetime: number };
    expect(e.preset).toBe("spark");
    expect(e.lifetime).toBe(0.3);
  });

  it("writes the optional color field onto the emitter when supplied", () => {
    const world = new World();
    spawnPuff(world, {
      id: "p.tinted",
      position: [0, 0, 0],
      preset: "spark",
      lifetime: 0.3,
      rate: 30,
      maxParticles: 8,
      color: "#abc123"
    });
    const e = world.getComponent("p.tinted", "ParticleEmitter") as { color?: string };
    expect(e.color).toBe("#abc123");
  });

  it("omits the color field on the emitter when not supplied", () => {
    const world = new World();
    spawnPuff(world, {
      id: "p.untinted",
      position: [0, 0, 0],
      preset: "spark",
      lifetime: 0.3,
      rate: 30,
      maxParticles: 8
    });
    const e = world.getComponent("p.untinted", "ParticleEmitter") as Record<string, unknown>;
    expect("color" in e).toBe(false);
  });
});
