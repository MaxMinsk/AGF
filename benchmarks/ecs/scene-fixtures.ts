// Synthetic scenes for ECS benchmarks. Kept small + deterministic so
// benchmark numbers are stable across runs and CI machines.

import { World } from "../../engine/core/ecs/world";

export type FixtureOptions = {
  entities: number;
  /** Whether to attach Transform.parent links (chain of length 8) to ~50% of entities. */
  hierarchy?: boolean;
};

/**
 * Build a World with N entities, each carrying:
 *   - Transform { position, rotation, scale }
 *   - MeshRenderer { mesh, color }
 *   - Tag (varies by index, so ~half match queries by tag kind)
 *
 * With `hierarchy: true`, every 8th entity becomes a chain root and the next
 * 7 inherit `parent` from the previous entity in the run. This matches the
 * worst-case depth the resolver will see in dogfood scenes.
 */
export function makeWorld(options: FixtureOptions): World {
  const world = new World();
  const n = options.entities;
  const chainEvery = options.hierarchy === true ? 8 : 0;
  for (let i = 0; i < n; i += 1) {
    const id = `e${i}`;
    world.addEntity(id);
    const transformData: Record<string, unknown> = {
      position: [i % 100, (i * 13) % 50, (i * 7) % 100],
      rotation: [0, (i * 11) % 360, 0],
      scale: [1, 1, 1]
    };
    if (chainEvery > 0 && i > 0 && i % chainEvery !== 0) {
      transformData["parent"] = `e${i - 1}`;
    }
    world.setComponent(id, "Transform", transformData);
    world.setComponent(id, "MeshRenderer", {
      mesh: i % 3 === 0 ? "box" : i % 3 === 1 ? "sphere" : "plane",
      color: `#${(i * 1234567).toString(16).padStart(6, "0").slice(0, 6)}`
    });
    if (i % 2 === 0) {
      world.setComponent(id, "TagEven", {});
    }
    if (i % 5 === 0) {
      world.setComponent(id, "TagFive", { rare: true });
    }
  }
  return world;
}

export const ENTITY_SIZES: ReadonlyArray<number> = [100, 1_000, 10_000];
