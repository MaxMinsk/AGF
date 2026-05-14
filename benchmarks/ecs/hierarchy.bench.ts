// ECS-B2 pilot: hierarchy resolve cost.
//
// `resolveHierarchy` runs every frame in `ThreeRenderer.buildResolvedTransforms`
// and is the most-allocating hot path. This benchmark is the baseline that
// M22 / M16-cache (LocalToWorld dirty-flag cache) must beat to ship.

import { createSuite, type SuiteResult } from "./runner";
import { resolveHierarchy, type TransformInput } from "../../engine/core/transform/resolve";
import { ENTITY_SIZES, makeWorld } from "./scene-fixtures";

export async function runHierarchyBench(): Promise<SuiteResult> {
  const suite = createSuite("ecs-hierarchy-resolve");

  for (const size of ENTITY_SIZES) {
    suite.bench(`resolveHierarchy flat @ ${size.toLocaleString("en-US")}`, () => {
      const inputs = buildInputs(size, false);
      return () => {
        resolveHierarchy(inputs);
      };
    });
    suite.bench(`resolveHierarchy chain-of-8 @ ${size.toLocaleString("en-US")}`, () => {
      const inputs = buildInputs(size, true);
      return () => {
        resolveHierarchy(inputs);
      };
    });
  }

  return suite.run();
}

function buildInputs(size: number, hierarchy: boolean): TransformInput[] {
  // Re-use the fixture builder; pulling inputs directly from the World gives
  // a realistic mix of nested + flat entries.
  const world = makeWorld({ entities: size, hierarchy });
  const inputs: TransformInput[] = [];
  for (const id of world.entityIds()) {
    const t = world.getComponent<Record<string, unknown>>(id, "Transform");
    if (t === undefined) continue;
    const entry: TransformInput = { id };
    if (typeof t["parent"] === "string") entry.parent = t["parent"];
    const position = t["position"];
    const rotation = t["rotation"];
    const scale = t["scale"];
    if (Array.isArray(position)) entry.position = toVec3(position);
    if (Array.isArray(rotation)) entry.rotation = toVec3(rotation);
    if (Array.isArray(scale)) entry.scale = toVec3(scale);
    inputs.push(entry);
  }
  return inputs;
}

function toVec3(value: ReadonlyArray<unknown>): readonly [number, number, number] {
  const x = typeof value[0] === "number" ? value[0] : 0;
  const y = typeof value[1] === "number" ? value[1] : 0;
  const z = typeof value[2] === "number" ? value[2] : 0;
  return [x, y, z];
}
