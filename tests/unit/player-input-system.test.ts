import { describe, expect, it } from "vitest";
import { createPlayerInputSystem } from "../../engine/runtime/player-input-system";
import { World } from "../../engine/core/ecs/world";
import type { TimeContext } from "../../engine/core/loop/types";

function step(dt: number, world: World, pressed: Set<string>): void {
  const system = createPlayerInputSystem({ pressedKeys: pressed });
  const time: TimeContext = {
    elapsed: 0,
    dt,
    fixedDt: dt,
    frameCount: 0,
    fixedStepCount: 0
  };
  system.frameUpdate?.({ time, world });
  system.dispose();
}

function makeWorld(speed = 3): World {
  const world = new World();
  world.addEntity("player");
  world.setComponent("player", "Transform", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  world.setComponent("player", "PlayerControlled", { speed });
  return world;
}

function transformPosition(world: World): readonly [number, number, number] {
  const transform = world.getComponent<{ position: readonly [number, number, number] }>("player", "Transform");
  return transform?.position ?? [0, 0, 0];
}

describe("PlayerInputSystem", () => {
  it("does nothing when no movement keys are pressed", () => {
    const world = makeWorld();
    step(0.1, world, new Set());

    expect(transformPosition(world)).toEqual([0, 0, 0]);
  });

  it("moves the player along +X for KeyD", () => {
    const world = makeWorld(2);
    step(0.5, world, new Set(["KeyD"]));

    const [x, y, z] = transformPosition(world);
    expect(x).toBeCloseTo(1.0, 5);
    expect(y).toBe(0);
    expect(z).toBe(0);
  });

  it("moves the player along -Z for KeyW (forward)", () => {
    const world = makeWorld(4);
    step(0.25, world, new Set(["KeyW"]));

    const [x, y, z] = transformPosition(world);
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(-1.0, 5);
  });

  it("normalises diagonal input so speed is constant", () => {
    const world = makeWorld(Math.SQRT2);
    step(1, world, new Set(["KeyD", "KeyW"]));

    const [x, , z] = transformPosition(world);
    expect(Math.hypot(x, z)).toBeCloseTo(Math.SQRT2, 5);
    expect(x).toBeCloseTo(1, 5);
    expect(z).toBeCloseTo(-1, 5);
  });

  it("ignores entities without both PlayerControlled and Transform", () => {
    const world = new World();
    world.addEntity("orphan-controlled");
    world.setComponent("orphan-controlled", "PlayerControlled", { speed: 5 });
    world.addEntity("orphan-transform");
    world.setComponent("orphan-transform", "Transform", { position: [1, 0, 0] });

    expect(() => step(0.1, world, new Set(["KeyD"]))).not.toThrow();
    expect(world.getComponent("orphan-transform", "Transform")).toEqual({ position: [1, 0, 0] });
  });

  it("supports WASD and arrow keys interchangeably", () => {
    const world = makeWorld(2);
    step(0.5, world, new Set(["ArrowRight"]));

    const [x] = transformPosition(world);
    expect(x).toBeCloseTo(1.0, 5);
  });

  it("with onIntent set, forwards the normalised direction and leaves Transform untouched", () => {
    const world = makeWorld(5);
    const intents: Array<readonly [number, number]> = [];
    const pressed = new Set<string>(["KeyD", "KeyW"]);
    const system = createPlayerInputSystem({
      pressedKeys: pressed,
      onIntent: (direction) => intents.push(direction)
    });
    const time: TimeContext = {
      elapsed: 0,
      dt: 1,
      fixedDt: 1,
      frameCount: 0,
      fixedStepCount: 0
    };
    system.frameUpdate?.({ time, world });
    system.dispose();

    expect(intents).toHaveLength(1);
    const [nx, nz] = intents[0]!;
    expect(nx).toBeCloseTo(1 / Math.SQRT2, 5);
    expect(nz).toBeCloseTo(-1 / Math.SQRT2, 5);
    expect(transformPosition(world)).toEqual([0, 0, 0]);
  });

  it("with onIntent set, fires nothing when no movement keys are pressed", () => {
    const intents: Array<readonly [number, number]> = [];
    const system = createPlayerInputSystem({
      pressedKeys: new Set<string>(),
      onIntent: (direction) => intents.push(direction)
    });
    const time: TimeContext = {
      elapsed: 0,
      dt: 1,
      fixedDt: 1,
      frameCount: 0,
      fixedStepCount: 0
    };
    system.frameUpdate?.({ time, world: makeWorld() });
    system.dispose();

    expect(intents).toEqual([]);
  });
});
