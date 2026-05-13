import type {
  ComponentData,
  ComponentName,
  EntityId,
  SceneEntityInput,
  SceneInput
} from "../ecs/types";
import type { EngineCommand } from "./types";

/**
 * Produce the command stream that turns `prev` into `next`.
 *
 * Order:
 *   1. delete entities that disappeared in `next`;
 *   2. create entities that are new in `next`;
 *   3. remove components missing from entities that survived;
 *   4. set components that are new or changed on surviving entities.
 *
 * Components are compared by JSON value, so component data must remain
 * JSON-serializable (which the scene schema already enforces).
 */
export function diffScenes(prev: SceneInput, next: SceneInput): EngineCommand[] {
  const prevById = indexById(prev.entities);
  const nextById = indexById(next.entities);
  const commands: EngineCommand[] = [];

  for (const id of prevById.keys()) {
    if (!nextById.has(id)) {
      commands.push({ kind: "entity.delete", entityId: id });
    }
  }

  for (const [id, nextEntity] of nextById) {
    const prevEntity = prevById.get(id);
    if (prevEntity === undefined) {
      commands.push({
        kind: "entity.create",
        entityId: id,
        components: nextEntity.components
      });
      continue;
    }

    const prevComponents = prevEntity.components;
    const nextComponents = nextEntity.components;

    for (const name of Object.keys(prevComponents)) {
      if (!(name in nextComponents)) {
        commands.push({ kind: "component.remove", entityId: id, component: name });
      }
    }

    for (const [name, data] of Object.entries(nextComponents)) {
      const previous = prevComponents[name];
      if (previous === undefined || !sameComponentData(previous, data)) {
        commands.push({
          kind: "component.set",
          entityId: id,
          component: name,
          data
        });
      }
    }
  }

  return commands;
}

function indexById(entities: ReadonlyArray<SceneEntityInput>): Map<EntityId, SceneEntityInput> {
  const map = new Map<EntityId, SceneEntityInput>();
  for (const entity of entities) {
    map.set(entity.id, entity);
  }
  return map;
}

function sameComponentData(a: ComponentData, b: ComponentData): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: ComponentData): string {
  return JSON.stringify(value, sortedKeysReplacer);
}

function sortedKeysReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<ComponentName, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    const sorted: Record<string, unknown> = {};
    for (const [key, entry] of entries) {
      sorted[key] = entry;
    }
    return sorted;
  }
  return value;
}
