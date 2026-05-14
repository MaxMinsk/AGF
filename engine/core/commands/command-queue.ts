import { World } from "../ecs/world";
import type { CommandLogEntry, EngineCommand } from "./types";

export class CommandQueue {
  private readonly pending: EngineCommand[] = [];
  private readonly applied: CommandLogEntry[] = [];

  enqueue(command: EngineCommand): void {
    this.pending.push(command);
  }

  pendingCount(): number {
    return this.pending.length;
  }

  drainInto(world: World): CommandLogEntry[] {
    const drained: CommandLogEntry[] = [];
    while (this.pending.length > 0) {
      const command = this.pending.shift();
      if (command === undefined) {
        break;
      }
      applyCommand(world, command);
      const entry: CommandLogEntry = { index: this.applied.length, command };
      this.applied.push(entry);
      drained.push(entry);
    }
    return drained;
  }

  log(): ReadonlyArray<CommandLogEntry> {
    return this.applied;
  }
}

export function applyCommand(world: World, command: EngineCommand): void {
  switch (command.kind) {
    case "entity.create": {
      world.addEntity(command.entityId);
      const components = command.components;
      if (components !== undefined) {
        for (const [name, data] of Object.entries(components)) {
          world.setComponent(command.entityId, name, data);
        }
      }
      return;
    }
    case "entity.delete": {
      // M16-cascade: remove the entity AND every Transform-child transitively.
      // Children declare their parent via Transform.parent (Sprint 30 / M16).
      // Deleting a parent without removing children would leave orphans
      // whose world transform points at a non-existent ancestor, which
      // breaks the renderer + the inspect output. Walk the parent graph
      // once before mutating so the iteration sees a stable world.
      const toDelete = collectTransformDescendants(world, command.entityId);
      for (const id of toDelete) {
        world.removeEntity(id);
      }
      return;
    }
    case "component.set": {
      world.setComponent(command.entityId, command.component, command.data);
      return;
    }
    case "component.remove": {
      world.removeComponent(command.entityId, command.component);
      return;
    }
    // (entity.delete handled above; cascade helper at the bottom of the file.)
    case "scene.load": {
      for (const entityId of world.entityIds()) {
        world.removeEntity(entityId);
      }
      for (const entity of command.scene.entities) {
        world.addEntity(entity.id);
        for (const [name, data] of Object.entries(entity.components)) {
          world.setComponent(entity.id, name, data);
        }
      }
      return;
    }
  }
}

type TransformWithParent = { parent?: string };

function collectTransformDescendants(world: World, rootId: string): string[] {
  const result: string[] = [];
  if (!world.hasEntity(rootId)) {
    return result;
  }
  result.push(rootId);
  const frontier = [rootId];
  // Build a parent → children map once; cheaper than re-scanning entity ids
  // for every level of the chain.
  const childrenByParent = new Map<string, string[]>();
  for (const entityId of world.entityIds()) {
    if (!world.hasComponent(entityId, "Transform")) continue;
    const transform = world.getComponent<TransformWithParent>(entityId, "Transform");
    const parent = transform?.parent;
    if (typeof parent !== "string") continue;
    let bucket = childrenByParent.get(parent);
    if (bucket === undefined) {
      bucket = [];
      childrenByParent.set(parent, bucket);
    }
    bucket.push(entityId);
  }
  while (frontier.length > 0) {
    const current = frontier.shift() as string;
    const children = childrenByParent.get(current);
    if (children === undefined) continue;
    for (const child of children) {
      result.push(child);
      frontier.push(child);
    }
  }
  return result;
}
