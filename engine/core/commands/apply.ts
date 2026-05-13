// Pure command applicator — re-export so external callers can import the
// applicator without pulling in `CommandQueue` (or anything that imports
// systems). This module deliberately depends only on `../ecs/` and
// `./types`, which is the boundary the perf / hot-path tests enforce.

export { applyCommand } from "./command-queue";
