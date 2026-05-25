// S136 KABOOM-RAGDOLL-LIFETIME — engine ragdoll auto-teardown.
//
// Decrements RagdollLifetime.secondsRemaining each fixedUpdate by
// context.time.fixedDt. When the counter hits zero (or goes
// negative), writes RagdollTeardownRequest on the same root so the
// teardown-system disposes the bodies + joints next tick. Pairs
// with RagdollTemplate.lifetimeSeconds — the spawn-system stamps
// RagdollLifetime when that field is set.
//
// Pure ECS: no Rapier import. The teardown-system owns the actual
// release calls.

import type { ComponentName } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";

const RAGDOLL_LIFETIME: ComponentName = "RagdollLifetime";
const RAGDOLL_TEARDOWN_REQUEST: ComponentName = "RagdollTeardownRequest";

type LifetimeComponent = {
  secondsRemaining: number;
};

export type RagdollLifetimeSystemOptions = {
  name?: string;
};

export function createRagdollLifetimeSystem(
  options: RagdollLifetimeSystemOptions = {}
): System {
  const name = options.name ?? "ragdoll.lifetime";
  let cachedWorld: World | undefined;
  let lifetimes: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      lifetimes = world.createQuery([RAGDOLL_LIFETIME]);
      cachedWorld = world;
    }
    const dt = Math.max(0, context.time.fixedDt);
    if (dt <= 0) return;
    for (const rootId of lifetimes!.run()) {
      const lt = world.getComponent<LifetimeComponent>(rootId, RAGDOLL_LIFETIME);
      if (lt === undefined) continue;
      const next = (lt.secondsRemaining ?? 0) - dt;
      if (next <= 0) {
        // Don't issue a second request if teardown is already queued.
        if (!world.hasComponent(rootId, RAGDOLL_TEARDOWN_REQUEST)) {
          world.setComponent(rootId, RAGDOLL_TEARDOWN_REQUEST, {});
        }
        // Leave the lifetime component on the root; teardown-system
        // strips it alongside RagdollState + RagdollActive.
      } else {
        world.setComponent(rootId, RAGDOLL_LIFETIME, { secondsRemaining: next });
      }
    }
  };

  return { name, fixedUpdate };
}
