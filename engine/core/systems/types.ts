import type { TimeContext } from "../loop/types";
import type { World } from "../ecs/world";

export type SystemContext = {
  readonly time: Readonly<TimeContext>;
  readonly world: World;
};

export type System = {
  /** Unique name. Used for deduplication, lookup and diagnostics. */
  readonly name: string;
  /** Called once per fixed step in scheduler registration order. */
  fixedUpdate?(context: SystemContext): void;
};
