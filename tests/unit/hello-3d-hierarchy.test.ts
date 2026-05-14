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

    // arena.root sits at world (-1.8, 0.05, 0). All children derive from it.
    expectClose("arena.root", [-1.8, 0.05, 0]);
    // platform: local (0, -0.45, 0) under arena.root → (-1.8, -0.4, 0).
    expectClose("arena.platform", [-1.8, -0.4, 0]);
    // tower.base: now OFF-AXIS at local (0.8, 0.3, 0) — so arena.root's Y spin
    // sweeps the whole tower around. World = (-1.0, 0.35, 0).
    expectClose("tower.base", [-1.0, 0.35, 0]);
    // tower.crown: parent.base (scale 0.8) + local (0, 1, 0) → (-1.0, 0.35+0.8, 0).
    expectClose("tower.crown", [-1.0, 1.15, 0]);
    // tower.spire: off-axis at crown.local (0.5, 1, 0). Crown.world: pos
    // (-1.0, 1.15, 0), rot 45°y, scale (1.28, 0.32, 1.28).
    //   scale  → (0.64, 0.32, 0)
    //   Ry(45) → (0.4525, 0.32, -0.4525)
    //   T(-1.0, 1.15, 0) → (-0.5475, 1.47, -0.4525)
    expectClose("tower.spire", [-0.5475, 1.47, -0.4525]);
    // satellite.disc: off-axis at arena.root.local (-0.9, 0.9, 0) — so
    // arena.root's Y spin sweeps it around (opposite the tower).
    // World = (-2.7, 0.95, 0).
    expectClose("satellite.disc", [-2.7, 0.95, 0]);
    // satellite.beacon: off-axis at disc.local (0.8, 0.6, 0). Disc.world: pos
    // (-2.7, 0.95, 0), rot (0, 0, 30°), scale (0.55, 0.08, 0.55).
    //   scale  → (0.44, 0.048, 0)
    //   Rz(30) → (0.44*cos30 - 0.048*sin30, 0.44*sin30 + 0.048*cos30, 0)
    //         = (0.3811 - 0.024, 0.22 + 0.0416, 0) = (0.3571, 0.2616, 0)
    //   T(-2.7, 0.95, 0) → (-2.3429, 1.2116, 0)
    expectClose("satellite.beacon", [-2.3429, 1.2116, 0]);
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
