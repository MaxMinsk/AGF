import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
