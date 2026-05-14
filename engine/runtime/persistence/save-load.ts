// `runtime.save() / load() / clearSave()` semantics.
//
// A save snapshot contains, per entity, only the component values whose
// names are listed in the project's persistence allowlist. The allowlist
// lives in `project.json#persistence.components` and is the only way to
// persist a component — there is no opt-out marker, no implicit "save
// everything", and no persistence of components the project did not
// explicitly approve. Server-authoritative components stay server-side
// unless the project's persistence config explicitly includes them.

import type { World } from "../../core/ecs/world";
import { applyCommand } from "../../core/commands/command-queue";
import type { EngineCommand } from "../../core/commands/types";
import type { LocalStore } from "./local-store";

export const SAVE_FORMAT_VERSION = 1;

export type SaveBlob = {
  agfFormatVersion: number;
  projectId: string;
  savedAt: string;
  /** Per-entity allowlisted component values. */
  entities: ReadonlyArray<{
    id: string;
    components: Record<string, unknown>;
  }>;
};

export type SaveContext = {
  projectId: string;
  profile: string;
  /** Components the project has explicitly opted in to persist. */
  allowlist: ReadonlyArray<string>;
};

export async function saveWorld(
  world: World,
  store: LocalStore,
  key: string,
  context: SaveContext
): Promise<SaveBlob> {
  const allow = new Set(context.allowlist);
  const entities: SaveBlob["entities"] = world.entityIds().map((id) => {
    const components: Record<string, unknown> = {};
    for (const name of allow) {
      if (world.hasComponent(id, name)) {
        components[name] = world.getComponent(id, name);
      }
    }
    return { id, components };
  });

  const blob: SaveBlob = {
    agfFormatVersion: SAVE_FORMAT_VERSION,
    projectId: context.projectId,
    savedAt: new Date().toISOString(),
    entities
  };

  await store.set(key, blob);
  return blob;
}

/**
 * Load a save into the live world. Only entities that already exist in the
 * world have their persisted components re-applied — load does not create
 * or delete entities; the scene definition is authoritative for entity
 * lifetime. Returns the list of entity ids that received at least one
 * component override.
 */
export async function loadWorld(
  world: World,
  store: LocalStore,
  key: string,
  context: SaveContext
): Promise<{ blob: SaveBlob | undefined; restoredEntities: string[] }> {
  const raw = await store.get(key);
  if (raw === undefined) {
    return { blob: undefined, restoredEntities: [] };
  }
  const blob = raw as SaveBlob;
  if (blob.agfFormatVersion !== SAVE_FORMAT_VERSION) {
    throw new Error(
      `Save format mismatch: stored agfFormatVersion=${blob.agfFormatVersion}, runtime expects ${SAVE_FORMAT_VERSION}.`
    );
  }
  if (blob.projectId !== context.projectId) {
    throw new Error(
      `Save projectId mismatch: stored "${blob.projectId}", current project "${context.projectId}".`
    );
  }

  const allow = new Set(context.allowlist);
  const restored: string[] = [];
  const commands: EngineCommand[] = [];
  for (const entry of blob.entities) {
    if (!world.hasEntity(entry.id)) {
      continue;
    }
    let touched = false;
    for (const [name, value] of Object.entries(entry.components)) {
      if (!allow.has(name)) continue;
      commands.push({ kind: "component.set", entityId: entry.id, component: name, data: value });
      touched = true;
    }
    if (touched) {
      restored.push(entry.id);
    }
  }
  for (const cmd of commands) {
    applyCommand(world, cmd);
  }
  return { blob, restoredEntities: restored };
}

export async function clearWorldSave(store: LocalStore, key: string): Promise<void> {
  await store.delete(key);
}
