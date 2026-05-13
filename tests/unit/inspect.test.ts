import { describe, expect, it } from "vitest";
import { World } from "../../engine/core/ecs/world";
import { snapshotWorld } from "../../engine/runtime/inspect";
import type { TimeContext } from "../../engine/core/loop/types";

const time: TimeContext = {
  elapsed: 1.5,
  dt: 1 / 60,
  fixedDt: 1 / 60,
  frameCount: 90,
  fixedStepCount: 90
};

describe("snapshotWorld", () => {
  it("returns an empty snapshot for an empty world", () => {
    const snapshot = snapshotWorld(new World(), time);

    expect(snapshot.entityCount).toBe(0);
    expect(snapshot.entities).toEqual([]);
    expect(snapshot.time).toEqual(time);
  });

  it("sorts entities by id for deterministic comparison", () => {
    const world = new World();
    world.addEntity("zebra");
    world.addEntity("alpha");
    world.addEntity("middle");
    world.setComponent("alpha", "Name", { label: "A" });
    world.setComponent("middle", "Name", { label: "M" });
    world.setComponent("zebra", "Name", { label: "Z" });

    const snapshot = snapshotWorld(world, time);

    expect(snapshot.entities.map((entity) => entity.id)).toEqual(["alpha", "middle", "zebra"]);
  });

  it("includes only the components an entity actually has", () => {
    const world = new World();
    world.addEntity("hero");
    world.addEntity("ghost");
    world.setComponent("hero", "Transform", { position: [1, 2, 3] });
    world.setComponent("hero", "MeshRenderer", { mesh: "box" });
    world.setComponent("ghost", "Name", { label: "Ghost" });

    const snapshot = snapshotWorld(world, time);
    const hero = snapshot.entities.find((entity) => entity.id === "hero");
    const ghost = snapshot.entities.find((entity) => entity.id === "ghost");

    expect(Object.keys(hero?.components ?? {}).sort()).toEqual(["MeshRenderer", "Transform"]);
    expect(Object.keys(ghost?.components ?? {})).toEqual(["Name"]);
  });

  it("returns a clone of the time context so later mutations do not leak in", () => {
    const world = new World();
    const mutableTime: TimeContext = { ...time };
    const snapshot = snapshotWorld(world, mutableTime);
    mutableTime.elapsed = 99;

    expect(snapshot.time.elapsed).toBe(time.elapsed);
  });
});
