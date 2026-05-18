import { World } from "../ecs/world";
import type { DiagnosticsBus } from "../../runtime/diagnostics/diagnostics-bus";
import type { CommandLogEntry, EngineCommand } from "./types";

export type CommandQueueOptions = {
  /**
   * Optional diagnostics bus for AGF-LOG-LIFECYCLE-TRACES — emits
   * `AGF_SCENE_LOAD_APPLIED` with entity counts before/after when a
   * scene.load command is drained. Off by default so plain unit
   * tests don't have to wire a bus.
   */
  diagnostics?: DiagnosticsBus;
};

export class CommandQueue {
  private readonly pending: EngineCommand[] = [];
  private readonly applied: CommandLogEntry[] = [];
  private readonly diagnostics: DiagnosticsBus | undefined;
  // S83 AGF-LOG-ENTITY-RECREATED. Tracks ids that have been removed
  // via entity.delete (or wiped by scene.load) so a subsequent
  // entity.create on the same id can be flagged. Set entries persist
  // for the lifetime of the queue — recreation is the symptom of
  // restart-style bugs, and we want to catch it even across many
  // intermediate frames.
  private readonly deletedIds = new Set<string>();

  constructor(options: CommandQueueOptions = {}) {
    this.diagnostics = options.diagnostics;
  }

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
      const before = command.kind === "scene.load" ? world.entityIds().length : 0;
      // S83 AGF-LOG-ENTITY-RECREATED. Detect entity.create on a
      // previously-deleted id BEFORE applying, so the diagnostic sits
      // ahead of any side effects.
      if (
        command.kind === "entity.create" &&
        this.deletedIds.has(command.entityId) &&
        this.diagnostics !== undefined
      ) {
        this.diagnostics.emit({
          severity: "warning",
          code: "AGF_ENTITY_RECREATED",
          source: "commands",
          message: `entity "${command.entityId}" recreated after a prior delete`,
          entityId: command.entityId,
          details: { entityId: command.entityId }
        });
      }
      // scene.load wipes the entire world inside applyCommand. To track
      // recreated ids across the wipe, snapshot the about-to-be-removed
      // ids BEFORE the apply step. Re-creating any of those via a later
      // entity.create surfaces the same warning.
      const wipedIds = command.kind === "scene.load" ? new Set(world.entityIds()) : undefined;
      applyCommand(world, command);
      if (command.kind === "entity.delete") {
        this.deletedIds.add(command.entityId);
      } else if (command.kind === "entity.create") {
        // A fresh create clears the "previously deleted" stamp so we
        // don't repeatedly warn for ids that legitimately recycle.
        this.deletedIds.delete(command.entityId);
      } else if (command.kind === "scene.load" && wipedIds !== undefined) {
        for (const id of wipedIds) this.deletedIds.add(id);
        // The new scene's ids are freshly created — drop them from the
        // deleted set so back-to-back scene.load doesn't warn.
        for (const e of command.scene.entities) this.deletedIds.delete(e.id);
      }
      if (command.kind === "scene.load" && this.diagnostics !== undefined) {
        const after = world.entityIds().length;
        this.diagnostics.emit({
          severity: "info",
          code: "AGF_SCENE_LOAD_APPLIED",
          source: "scene",
          message: `scene.load applied (${before} → ${after} entities)`,
          details: { entityCountBefore: before, entityCountAfter: after, sceneId: command.scene.id }
        });
      }
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
