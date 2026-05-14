// ECS-B2 pilot: query patterns at 100 / 1k / 10k entities.
//
// Three patterns matter:
//   - Single-component query (the common "all renderables" pull).
//   - Two-component query (the typical system filter, e.g. MeshRenderer + Transform).
//   - Cached `createQuery` handle (memoised against revision counter).
//
// Cached handle should be ~free between structural changes. The number we
// care about most is the *uncached* two-component query, since that's what
// every system pays per frame if it doesn't memoise.

import { createSuite, type SuiteResult } from "./runner";
import { ENTITY_SIZES, makeWorld } from "./scene-fixtures";

export async function runQueryBench(): Promise<SuiteResult> {
  const suite = createSuite("ecs-query");
  for (const size of ENTITY_SIZES) {
    suite.bench(`query(['MeshRenderer']) @ ${size.toLocaleString("en-US")}`, () => {
      const world = makeWorld({ entities: size });
      return () => {
        world.query(["MeshRenderer"]);
      };
    });
    suite.bench(`query(['MeshRenderer','Transform']) @ ${size.toLocaleString("en-US")}`, () => {
      const world = makeWorld({ entities: size });
      return () => {
        world.query(["MeshRenderer", "Transform"]);
      };
    });
    suite.bench(`createQuery(['MeshRenderer','Transform']).run() @ ${size.toLocaleString("en-US")}`, () => {
      const world = makeWorld({ entities: size });
      const handle = world.createQuery(["MeshRenderer", "Transform"]);
      handle.run();
      return () => {
        handle.run();
      };
    });
    suite.bench(`query(['TagFive']) rare-match @ ${size.toLocaleString("en-US")}`, () => {
      const world = makeWorld({ entities: size });
      return () => {
        world.query(["TagFive"]);
      };
    });
  }
  return suite.run();
}
