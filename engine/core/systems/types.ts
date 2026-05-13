import type { TimeContext } from "../loop/types";
import type { World } from "../ecs/world";

export type SystemContext = {
  readonly time: Readonly<TimeContext>;
  readonly world: World;
};

export type System = {
  /** Unique name. Used for deduplication, lookup and diagnostics. */
  readonly name: string;
  /** Called once per fixed step in scheduler registration order. `context.time.dt` equals `fixedDt`. */
  fixedUpdate?(context: SystemContext): void;
  /** Called once per render frame in scheduler registration order. `context.time.dt` is the real frame delta. */
  frameUpdate?(context: SystemContext): void;
};
