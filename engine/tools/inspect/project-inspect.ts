import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { checkProject, formatDiagnostics, type CheckResult, type Diagnostic } from "../check/project-check";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

export type InspectEntity = {
  id: string;
  order: number;
  componentNames: string[];
  components: JsonObject;
};

export type InspectResult = {
  ok: boolean;
  projectDir: string;
  diagnostics: Diagnostic[];
  filter?: InspectFilterSummary;
  project?: {
    id: string;
    name: string;
    startScene: string;
    assetRoot: string;
    profiles: string[];
  };
  scene?: {
    id: string;
    entityCount: number;
    matchedEntityCount: number;
    entities: InspectEntity[];
  };
};

export type InspectOptions = {
  /** Entity must have ALL of these components to be included. */
  components?: ReadonlyArray<string>;
  /** Entity id must be in this list to be included. */
  entityIds?: ReadonlyArray<string>;
};

export type InspectFilterSummary = {
  components: ReadonlyArray<string>;
  entityIds: ReadonlyArray<string>;
};

export function inspectProject(projectDirInput: string, options: InspectOptions = {}): InspectResult {
  const checkResult = checkProject(projectDirInput);
  if (!checkResult.ok) {
    return {
      ok: false,
      projectDir: checkResult.projectDir,
      diagnostics: checkResult.diagnostics
    };
  }

  const projectData = readJsonObject(resolve(checkResult.projectDir, "project.json"));
  const startScene = readRequiredString(projectData, "startScene");
  const sceneData = readJsonObject(resolve(checkResult.projectDir, startScene));
  const allEntities = normalizeEntities(sceneData);
  const filter = normaliseFilter(options);
  const entities = applyFilter(allEntities, filter);

  const result: InspectResult = {
    ok: true,
    projectDir: checkResult.projectDir,
    diagnostics: checkResult.diagnostics,
    project: {
      id: readRequiredString(projectData, "id"),
      name: readRequiredString(projectData, "name"),
      startScene,
      assetRoot: readRequiredString(projectData, "assetRoot"),
      profiles: readStringArray(projectData["profiles"])
    },
    scene: {
      id: readRequiredString(sceneData, "id"),
      entityCount: allEntities.length,
      matchedEntityCount: entities.length,
      entities
    }
  };

  if (filter.components.length > 0 || filter.entityIds.length > 0) {
    result.filter = filter;
  }

  return result;
}

/**
 * Returns a copy of {@link result} with machine-specific fields normalised so
 * two runs of the same project on different machines produce byte-identical
 * JSON when the world is unchanged.
 *
 * Currently this means:
 *   * `projectDir` collapses to just the directory basename
 *     (`/Users/.../examples/hello-3d` → `hello-3d`).
 *   * top-level keys are emitted in a stable, alphabetical order so JSON
 *     output is byte-stable across Node versions.
 *
 * Component values themselves are already sorted alphabetically by
 * `inspectProject`, so no further work is needed there.
 */
/**
 * Returns a copy of {@link result} with the entity list truncated to the last
 * {@link tail} entities. `matchedEntityCount` reflects the total before
 * truncation; `entities.length` is what's actually returned. Useful for agents
 * limiting their context window when scenes grow.
 */
export function tailInspectResult(result: InspectResult, tail: number | undefined): InspectResult {
  if (tail === undefined || result.scene === undefined) {
    return result;
  }
  if (tail < 0 || tail >= result.scene.entities.length) {
    return result;
  }
  const kept = tail === 0 ? [] : result.scene.entities.slice(-tail);
  return {
    ...result,
    scene: {
      ...result.scene,
      entities: kept,
      matchedEntityCount: result.scene.matchedEntityCount
    }
  };
}

export function toStableInspectResult(result: InspectResult): InspectResult {
  const stable: InspectResult = {
    ok: result.ok,
    diagnostics: result.diagnostics,
    projectDir: basename(result.projectDir)
  };
  if (result.filter !== undefined) {
    stable.filter = result.filter;
  }
  if (result.project !== undefined) {
    stable.project = result.project;
  }
  if (result.scene !== undefined) {
    stable.scene = result.scene;
  }
  return JSON.parse(JSON.stringify(stable, stableReplacer)) as InspectResult;
}

function stableReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
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

export function formatInspection(result: InspectResult): string {
  if (!result.ok || result.project === undefined || result.scene === undefined) {
    return formatDiagnostics(result as CheckResult);
  }

  const lines = [`Project: ${result.project.name} (${result.project.id})`, `Start scene: ${result.project.startScene}`, `Scene: ${result.scene.id}`];

  if (result.filter !== undefined) {
    const parts: string[] = [];
    if (result.filter.components.length > 0) {
      parts.push(`components=[${result.filter.components.join(", ")}]`);
    }
    if (result.filter.entityIds.length > 0) {
      parts.push(`entities=[${result.filter.entityIds.join(", ")}]`);
    }
    lines.push(`Filter: ${parts.join(" ")}`);
    lines.push(`Entities: ${result.scene.matchedEntityCount} / ${result.scene.entityCount}`);
  } else {
    lines.push(`Entities: ${result.scene.entityCount}`);
  }

  const shown = result.scene.entities.length;
  if (shown < result.scene.matchedEntityCount) {
    const hidden = result.scene.matchedEntityCount - shown;
    lines.push(`Showing last ${shown} of ${result.scene.matchedEntityCount} (${hidden} hidden by --tail).`);
  }

  for (const entity of result.scene.entities) {
    const componentText = entity.componentNames.length === 0 ? "no components" : entity.componentNames.join(", ");
    lines.push(`- ${entity.id}: ${componentText}`);
  }

  if (result.diagnostics.length > 0) {
    lines.push("", "Diagnostics:", formatDiagnostics(result as CheckResult));
  }

  return lines.join("\n");
}

function normaliseFilter(options: InspectOptions): InspectFilterSummary {
  const components = (options.components ?? []).filter((value) => value.length > 0);
  const entityIds = (options.entityIds ?? []).filter((value) => value.length > 0);
  return { components, entityIds };
}

function applyFilter(entities: InspectEntity[], filter: InspectFilterSummary): InspectEntity[] {
  if (filter.components.length === 0 && filter.entityIds.length === 0) {
    return entities;
  }
  return entities.filter((entity) => {
    if (filter.entityIds.length > 0 && !filter.entityIds.includes(entity.id)) {
      return false;
    }
    for (const name of filter.components) {
      if (!entity.componentNames.includes(name)) {
        return false;
      }
    }
    return true;
  });
}

function normalizeEntities(sceneData: JsonObject): InspectEntity[] {
  const entities = sceneData["entities"];
  if (!Array.isArray(entities)) {
    return [];
  }

  return entities.flatMap((entity, order) => {
    if (!isJsonObject(entity)) {
      return [];
    }

    const id = typeof entity["id"] === "string" ? entity["id"] : `entity.${order}`;
    const rawComponents = entity["components"];
    const components = isJsonObject(rawComponents) ? sortJsonObject(rawComponents) : {};

    return [
      {
        id,
        order,
        componentNames: Object.keys(components).sort(),
        components
      }
    ];
  });
}

function readJsonObject(filePath: string): JsonObject {
  const data = JSON.parse(readFileSync(filePath, "utf8")) as JsonValue;
  if (!isJsonObject(data)) {
    throw new Error(`Expected JSON object at ${filePath}.`);
  }

  return data;
}

function readRequiredString(object: JsonObject, key: string): string {
  const value = object[key];
  if (typeof value !== "string") {
    throw new Error(`Expected string property "${key}".`);
  }

  return value;
}

function readStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function sortJsonObject(object: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(object)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, sortJsonValue(value)])
  );
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (isJsonObject(value)) {
    return sortJsonObject(value);
  }

  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
