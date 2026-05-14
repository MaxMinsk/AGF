import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { World } from "../../engine/core/ecs/world";
import { resolveWorldHierarchy } from "../../engine/core/transform/resolve";
import type { SceneInput } from "../../engine/core/ecs/types";

const here = dirname(fileURLToPath(import.meta.url));
const scenePath = resolve(here, "../../examples/hello-3d/scenes/start.scene.json");
const scene = JSON.parse(readFileSync(scenePath, "utf8")) as SceneInput;

// `resolveWorldHierarchy` consumes scene rotations in radians; the hello-3d
// scene stores them in degrees. Convert in place for the test only.
const sceneInRadians: SceneInput = {
  id: scene.id,
  entities: scene.entities.map((entity) => {
    const components = { ...entity.components } as Record<string, unknown>;
    const transform = components["Transform"] as
      | { position?: number[]; rotation?: number[]; scale?: number[]; parent?: string }
      | undefined;
    if (transform?.rotation !== undefined) {
      components["Transform"] = {
        ...transform,
        rotation: transform.rotation.map((deg) => (deg * Math.PI) / 180)
      };
    }
    return { id: entity.id, components };
  })
};

describe("hello-3d transform hierarchy showcase", () => {
  it("scene declares the 6 hierarchy entities (plus invisible root) parented as documented", () => {
    const idsWithParent = scene.entities
      .filter((e) => {
        const t = e.components["Transform"] as { parent?: string } | undefined;
        return t?.parent !== undefined;
      })
      .map((e) => e.id);
    expect(idsWithParent.sort()).toEqual(
      [
        "arena.platform",
        "tower.base",
        "tower.crown",
        "tower.spire",
        "satellite.disc",
        "satellite.beacon"
      ].sort()
    );
  });

  it("resolver produces the documented world positions for every hierarchy entity", () => {
    const world = World.fromScene(sceneInRadians);
    const resolved = resolveWorldHierarchy(world);

    const expectClose = (id: string, expected: readonly [number, number, number]): void => {
      const actual = resolved.get(id)?.world.position;
      expect(actual, `world position of ${id}`).toBeDefined();
      const a = actual as readonly [number, number, number];
      expect(a[0]).toBeCloseTo(expected[0], 3);
      expect(a[1]).toBeCloseTo(expected[1], 3);
      expect(a[2]).toBeCloseTo(expected[2], 3);
    };

    // arena.root sits at world (-2.4, 0, 0). All children are derived from it.
    expectClose("arena.root", [-2.4, 0, 0]);
    expectClose("arena.platform", [-2.4, -0.45, 0]);
    expectClose("tower.base", [-2.4, 0.3, 0]);
    // crown is parent.base (scale 0.8) shifted up by 1 in local Y.
    expectClose("tower.crown", [-2.4, 0.3 + 0.8, 0]);
    // spire sits at crown.local Y=1.1, which after crown's world scale [1.28, 0.32, 1.28] becomes 1.1 * 0.32 = 0.352.
    expectClose("tower.spire", [-2.4, 1.1 + 0.352, 0]);
    // disc is parented to arena.root, local (1.6, 0.9, 0); no extra rotation/scale on the parent.
    expectClose("satellite.disc", [-0.8, 0.9, 0]);
    // beacon is at disc.local (0, 1.4, 0). Disc has scale (0.5, 0.08, 0.5) and rotation 60° around Z.
    //   scale (0, 1.4*0.08, 0) = (0, 0.112, 0)
    //   rotate Z by 60°:  x' = -y*sin(60) = -0.112*0.866 ≈ -0.097, y' = y*cos(60) = 0.112*0.5 = 0.056
    //   translate (-0.8, 0.9, 0) → (-0.897, 0.956, 0)
    expectClose("satellite.beacon", [-0.897, 0.956, 0]);
  });

  it("compose parents' scale: tower.spire inherits 0.8 * 0.4 * 1.6 along Y", () => {
    const world = World.fromScene(sceneInRadians);
    const resolved = resolveWorldHierarchy(world);
    const spire = resolved.get("tower.spire");
    expect(spire?.world.scale[1]).toBeCloseTo(0.8 * 0.4 * 1.6, 3);
  });

  it("compose parents' scale: satellite.beacon inherits 0.08 * 1.7 along Y, after the disc's tilt", () => {
    const world = World.fromScene(sceneInRadians);
    const resolved = resolveWorldHierarchy(world);
    const beacon = resolved.get("satellite.beacon");
    // World scale magnitude is preserved despite the parent's rotation, so the
    // Y-axis world scale stays at parent.Y * local.Y = 0.08 * 1.7 = 0.136.
    expect(beacon?.world.scale[1]).toBeCloseTo(0.08 * 1.7, 3);
  });
});
