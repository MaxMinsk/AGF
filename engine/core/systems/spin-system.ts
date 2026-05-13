import type { System, SystemContext } from "./types";
import type { QueryHandle, World } from "../ecs/world";

type Axis = "x" | "y" | "z";

type SpinComponent = {
  axis: Axis;
  /** Degrees per second around the axis. */
  speed: number;
};

type TransformComponent = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
};

const AXIS_INDEX: Readonly<Record<Axis, 0 | 1 | 2>> = { x: 0, y: 1, z: 2 };

export function createSpinSystem(name = "spin"): System {
  let cachedWorld: World | undefined;
  let spinningQuery: QueryHandle | undefined;
  return {
    name,
    fixedUpdate({ time, world }: SystemContext): void {
      if (world !== cachedWorld) {
        spinningQuery = world.createQuery(["Spin", "Transform"]);
        cachedWorld = world;
      }
      const entities = spinningQuery!.run();
      for (const entityId of entities) {
        const spin = world.getComponent<SpinComponent>(entityId, "Spin");
        const transform = world.getComponent<TransformComponent>(entityId, "Transform");
        if (spin === undefined || transform === undefined) {
          continue;
        }

        const axisIndex = AXIS_INDEX[spin.axis];
        const existing = transform.rotation;
        const rx = existing?.[0] ?? 0;
        const ry = existing?.[1] ?? 0;
        const rz = existing?.[2] ?? 0;
        const delta = spin.speed * time.dt;

        const nextRotation: [number, number, number] = [rx, ry, rz];
        nextRotation[axisIndex] = nextRotation[axisIndex] + delta;

        world.setComponent(entityId, "Transform", {
          ...transform,
          rotation: nextRotation
        });
      }
    }
  };
}
