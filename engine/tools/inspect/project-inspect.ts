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
    entities: InspectEntity[];
  };
};

export function inspectProject(projectDirInput: string): InspectResult {
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
  const entities = normalizeEntities(sceneData);

  return {
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
      entityCount: entities.length,
      entities
    }
  };
}

export function formatInspection(result: InspectResult): string {
  if (!result.ok || result.project === undefined || result.scene === undefined) {
    return formatDiagnostics(result as CheckResult);
  }

  const lines = [
    `Project: ${result.project.name} (${result.project.id})`,
    `Start scene: ${result.project.startScene}`,
    `Scene: ${result.scene.id}`,
    `Entities: ${result.scene.entityCount}`,
    ...result.scene.entities.map((entity) => {
      const componentText = entity.componentNames.length === 0 ? "no components" : entity.componentNames.join(", ");
      return `- ${entity.id}: ${componentText}`;
    })
  ];

  if (result.diagnostics.length > 0) {
    lines.push("", "Diagnostics:", formatDiagnostics(result as CheckResult));
  }

  return lines.join("\n");
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
