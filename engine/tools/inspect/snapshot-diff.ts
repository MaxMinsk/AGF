import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { InspectEntity, InspectResult } from "./project-inspect";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

export type SnapshotDiffEntry =
  | {
      kind: "entity.added";
      entityId: string;
      components: ReadonlyArray<string>;
    }
  | {
      kind: "entity.removed";
      entityId: string;
      components: ReadonlyArray<string>;
    }
  | {
      kind: "component.added";
      entityId: string;
      component: string;
      next: JsonValue;
    }
  | {
      kind: "component.removed";
      entityId: string;
      component: string;
      previous: JsonValue;
    }
  | {
      kind: "component.changed";
      entityId: string;
      component: string;
      previous: JsonValue;
      next: JsonValue;
    };

export type SnapshotDiffResult = {
  ok: boolean;
  previousPath: string;
  nextPath: string;
  changeCount: number;
  changes: SnapshotDiffEntry[];
};

export function readInspectSnapshot(filePath: string): InspectResult {
  const absolute = resolve(filePath);
  const raw = readFileSync(absolute, "utf8");
  return JSON.parse(raw) as InspectResult;
}

export function diffSnapshots(previous: InspectResult, next: InspectResult): SnapshotDiffEntry[] {
  const previousEntities = entityIndex(previous);
  const nextEntities = entityIndex(next);
  const changes: SnapshotDiffEntry[] = [];

  for (const [id, entity] of previousEntities) {
    if (!nextEntities.has(id)) {
      changes.push({
        kind: "entity.removed",
        entityId: id,
        components: entity.componentNames
      });
    }
  }

  for (const [id, nextEntity] of nextEntities) {
    const previousEntity = previousEntities.get(id);
    if (previousEntity === undefined) {
      changes.push({
        kind: "entity.added",
        entityId: id,
        components: nextEntity.componentNames
      });
      continue;
    }

    for (const component of previousEntity.componentNames) {
      if (!nextEntity.componentNames.includes(component)) {
        changes.push({
          kind: "component.removed",
          entityId: id,
          component,
          previous: previousEntity.components[component] ?? null
        });
      }
    }

    for (const component of nextEntity.componentNames) {
      const previousValue = previousEntity.components[component];
      const nextValue = nextEntity.components[component];
      if (previousValue === undefined) {
        changes.push({
          kind: "component.added",
          entityId: id,
          component,
          next: nextValue ?? null
        });
        continue;
      }
      if (!sameJsonValue(previousValue, nextValue)) {
        changes.push({
          kind: "component.changed",
          entityId: id,
          component,
          previous: previousValue,
          next: nextValue ?? null
        });
      }
    }
  }

  return changes;
}

export function formatDiff(diff: SnapshotDiffResult): string {
  if (diff.changes.length === 0) {
    return `No changes between ${diff.previousPath} and ${diff.nextPath}.`;
  }

  const lines = [
    `Diff: ${diff.previousPath} -> ${diff.nextPath}`,
    `Changes: ${diff.changeCount}`
  ];
  for (const change of diff.changes) {
    switch (change.kind) {
      case "entity.added":
        lines.push(`+ entity ${change.entityId} (${change.components.join(", ") || "no components"})`);
        break;
      case "entity.removed":
        lines.push(`- entity ${change.entityId} (${change.components.join(", ") || "no components"})`);
        break;
      case "component.added":
        lines.push(`+ ${change.entityId}.${change.component} = ${stringify(change.next)}`);
        break;
      case "component.removed":
        lines.push(`- ${change.entityId}.${change.component} (was ${stringify(change.previous)})`);
        break;
      case "component.changed":
        lines.push(`~ ${change.entityId}.${change.component}: ${stringify(change.previous)} -> ${stringify(change.next)}`);
        break;
    }
  }
  return lines.join("\n");
}

function entityIndex(snapshot: InspectResult): Map<string, InspectEntity> {
  const map = new Map<string, InspectEntity>();
  if (snapshot.scene === undefined) {
    return map;
  }
  for (const entity of snapshot.scene.entities) {
    map.set(entity.id, entity);
  }
  return map;
}

function sameJsonValue(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: JsonValue | undefined): string {
  if (value === undefined) {
    return "undefined";
  }
  return JSON.stringify(value, replacer);
}

function replacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    const sorted: JsonObject = {};
    for (const [key, entry] of entries) {
      sorted[key] = entry as JsonValue;
    }
    return sorted;
  }
  return value;
}

function stringify(value: JsonValue): string {
  return JSON.stringify(value);
}
