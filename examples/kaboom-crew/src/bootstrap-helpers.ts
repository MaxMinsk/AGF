// S139 — small idempotent-upsert helpers for the kaboom-crew bootstrap.
//
// The HMR replay path re-runs attachUi against a live world that
// already contains the singletons created on the prior attach. The
// previous code emitted `entity.create` commands unconditionally,
// which throws on duplicate ids. These helpers split the command
// stream:
//   - new entity → emit entity.create with all components.
//   - existing entity → emit one component.set per component.
//
// Result: attachUi can be called any number of times against the same
// runtime without losing the singleton's surviving runtime state but
// also without throwing on the second pass.

import type { EngineCommand } from "../../../engine/core/commands/types";
import type { World } from "../../../engine/core/ecs/world";

/**
 * Build an idempotent set of commands that creates the entity if it
 * doesn't already exist, or updates each component in place if it
 * does. Pure — takes only the world, entityId, and components map.
 */
export function upsertEntityCommands(
  world: World,
  entityId: string,
  components: Record<string, unknown>
): EngineCommand[] {
  if (!world.hasEntity(entityId)) {
    return [
      {
        kind: "entity.create",
        entityId,
        components
      } as EngineCommand
    ];
  }
  const out: EngineCommand[] = [];
  for (const [component, data] of Object.entries(components)) {
    out.push({
      kind: "component.set",
      entityId,
      component,
      data
    } as EngineCommand);
  }
  return out;
}
