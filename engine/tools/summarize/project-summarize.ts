// Compact project summary for agents.
//
// Walks `<projectDir>` and emits a small descriptor that fits in a prompt:
// project metadata, profiles, declared component vocabulary, entity /
// component counts from the start scene, declared runtime asset count, list
// of playtest scenarios. JSON-friendly and human-formattable.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

export type ProjectSummary = {
  projectDir: string;
  project: {
    id: string;
    name: string;
    startScene: string;
    assetRoot: string;
    profiles: string[];
  };
  components: {
    builtIn: string[];
    projectLocal: string[];
  };
  scene: {
    id: string;
    entityCount: number;
    /** Aggregate count per component name across all entities. */
    componentUsage: Array<{ name: string; count: number }>;
  };
  assets: {
    declaredEntries: number;
    runtimeFiles: number;
  };
  playtests: string[];
  prefabs: string[];
};

const BUILT_IN_COMPONENT_NAMES = [
  "Camera",
  "MeshRenderer",
  "Name",
  "Networked",
  "PlayerControlled",
  "Presence",
  "Spin",
  "Transform"
] as const;

export function summarizeProject(projectDirInput: string): ProjectSummary {
  const projectDir = resolve(projectDirInput);
  const projectJson = readJsonObject(resolve(projectDir, "project.json"));

  const project = {
    id: readRequiredString(projectJson, "id"),
    name: readRequiredString(projectJson, "name"),
    startScene: readRequiredString(projectJson, "startScene"),
    assetRoot: readRequiredString(projectJson, "assetRoot"),
    profiles: readStringArray(projectJson["profiles"])
  };

  const projectLocalComponents: string[] = [];
  const extensionPath = resolve(projectDir, "schemas/scene-extensions.schema.json");
  if (existsSync(extensionPath)) {
    const extension = readJsonObject(extensionPath);
    const extComponents = extension["components"];
    if (isJsonObject(extComponents)) {
      projectLocalComponents.push(...Object.keys(extComponents).sort());
    }
  }

  const scenePath = resolve(projectDir, project.startScene);
  const sceneJson = readJsonObject(scenePath);
  const sceneEntities = Array.isArray(sceneJson["entities"]) ? sceneJson["entities"] : [];

  const componentUsage = new Map<string, number>();
  for (const entity of sceneEntities) {
    if (!isJsonObject(entity)) {
      continue;
    }
    const components = entity["components"];
    if (!isJsonObject(components)) {
      continue;
    }
    for (const name of Object.keys(components)) {
      componentUsage.set(name, (componentUsage.get(name) ?? 0) + 1);
    }
  }

  const sceneIdValue = sceneJson["id"];
  const sceneId = typeof sceneIdValue === "string" ? sceneIdValue : "";

  const assetSourcesPath = resolve(projectDir, project.assetRoot, "_sources/asset-sources.json");
  let declaredEntries = 0;
  let runtimeFiles = 0;
  if (existsSync(assetSourcesPath)) {
    const sourcesJson = readJsonObject(assetSourcesPath);
    if (Array.isArray(sourcesJson["assets"])) {
      declaredEntries = sourcesJson["assets"].length;
      for (const asset of sourcesJson["assets"]) {
        if (!isJsonObject(asset)) {
          continue;
        }
        const files = asset["runtimeFiles"];
        if (Array.isArray(files)) {
          runtimeFiles += files.length;
        }
      }
    }
  }

  const playtestsDir = resolve(projectDir, "playtests");
  const playtests: string[] = [];
  if (existsSync(playtestsDir) && statSync(playtestsDir).isDirectory()) {
    for (const entry of readdirSync(playtestsDir)) {
      if (entry.endsWith(".playtest.json")) {
        playtests.push(entry);
      }
    }
    playtests.sort();
  }

  const prefabsDir = resolve(projectDir, "prefabs");
  const prefabs: string[] = [];
  if (existsSync(prefabsDir) && statSync(prefabsDir).isDirectory()) {
    for (const entry of readdirSync(prefabsDir)) {
      if (entry.endsWith(".prefab.json")) {
        prefabs.push(entry);
      }
    }
    prefabs.sort();
  }

  return {
    projectDir: basename(projectDir),
    project,
    components: {
      builtIn: [...BUILT_IN_COMPONENT_NAMES],
      projectLocal: projectLocalComponents
    },
    scene: {
      id: sceneId,
      entityCount: sceneEntities.length,
      componentUsage: [...componentUsage.entries()]
        .sort(([a, ac], [b, bc]) => bc - ac || a.localeCompare(b))
        .map(([name, count]) => ({ name, count }))
    },
    assets: {
      declaredEntries,
      runtimeFiles
    },
    playtests,
    prefabs
  };
}

export function formatSummary(summary: ProjectSummary): string {
  const lines: string[] = [];
  lines.push(`Project: ${summary.project.name} (${summary.project.id})`);
  lines.push(`  startScene: ${summary.project.startScene}`);
  lines.push(`  assetRoot:  ${summary.project.assetRoot}`);
  lines.push(`  profiles:   ${summary.project.profiles.join(", ") || "(none)"}`);

  lines.push("");
  lines.push("Components:");
  lines.push(`  built-in:      ${summary.components.builtIn.join(", ")}`);
  lines.push(`  project-local: ${summary.components.projectLocal.join(", ") || "(none)"}`);

  lines.push("");
  lines.push(`Scene "${summary.scene.id}":`);
  lines.push(`  entities: ${summary.scene.entityCount}`);
  if (summary.scene.componentUsage.length > 0) {
    lines.push("  component usage (sorted by count desc):");
    for (const { name, count } of summary.scene.componentUsage) {
      lines.push(`    - ${name}: ${count}`);
    }
  }

  lines.push("");
  lines.push(`Assets:`);
  lines.push(`  declared entries: ${summary.assets.declaredEntries}`);
  lines.push(`  runtime files:    ${summary.assets.runtimeFiles}`);

  lines.push("");
  if (summary.playtests.length === 0) {
    lines.push("Playtests: (none)");
  } else {
    lines.push(`Playtests (${summary.playtests.length}):`);
    for (const file of summary.playtests) {
      lines.push(`  - ${file}`);
    }
  }

  lines.push("");
  if (summary.prefabs.length === 0) {
    lines.push("Prefabs: (none)");
  } else {
    lines.push(`Prefabs (${summary.prefabs.length}):`);
    for (const file of summary.prefabs) {
      lines.push(`  - ${file}`);
    }
  }

  return lines.join("\n");
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

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
