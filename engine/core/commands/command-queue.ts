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
      world.removeEntity(command.entityId);
      return;
    }
    case "component.set": {
      world.setComponent(command.entityId, command.component, command.data);
      return;
    }
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
