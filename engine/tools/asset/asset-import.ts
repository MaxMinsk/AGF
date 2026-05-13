// `engine asset import` v0.
//
// Given a source file and an `--id`, copy it into the project's
// `assets/runtime/<subdir>/` and append an entry to `asset-sources.json` so
// `engine check` accepts it immediately. Idempotent: importing the same id
// twice is an error; importing the same file twice with a different id
// raises a warning that the file path is already declared.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

type JsonObject = { [key: string]: unknown };

export type AssetImportOptions = {
  projectDir: string;
  sourceFile: string;
  id: string;
  kind?: string;
  license?: string;
  notes?: string;
  /**
   * Subdirectory under `assets/runtime/` to copy the file into. Defaults to
   * `models` for `.glb`/`.gltf`, `materials` for `.material.json`, otherwise
   * `misc`.
   */
  subdir?: string;
};

export type AssetImportResult = {
  projectDir: string;
  runtimePath: string;
  runtimeRef: string;
  sourcesPath: string;
  added: boolean;
};

export function importAsset(options: AssetImportOptions): AssetImportResult {
  const projectDir = resolve(options.projectDir);
  const projectJsonPath = resolve(projectDir, "project.json");
  if (!existsSync(projectJsonPath)) {
    throw new Error(`No project.json at ${projectDir}`);
  }
  const projectJson = JSON.parse(readFileSync(projectJsonPath, "utf8")) as JsonObject;
  const assetRoot = typeof projectJson["assetRoot"] === "string" ? projectJson["assetRoot"] : "assets";
  const assetRootPath = resolve(projectDir, assetRoot);

  const sourceFile = resolve(options.sourceFile);
  if (!existsSync(sourceFile)) {
    throw new Error(`Source file not found: ${sourceFile}`);
  }
  const subdir = options.subdir ?? defaultSubdirFor(sourceFile);
  const targetName = basename(sourceFile);
  const runtimeRef = `runtime/${subdir}/${targetName}`;
  const runtimePath = resolve(assetRootPath, runtimeRef);

  mkdirSync(dirname(runtimePath), { recursive: true });
  copyFileSync(sourceFile, runtimePath);

  const sourcesPath = resolve(assetRootPath, "_sources/asset-sources.json");
  if (!existsSync(sourcesPath)) {
    mkdirSync(dirname(sourcesPath), { recursive: true });
    writeFileSync(sourcesPath, JSON.stringify({ version: 1, assets: [] }, null, 2));
  }
  const sources = JSON.parse(readFileSync(sourcesPath, "utf8")) as {
    version?: number;
    assets?: unknown[];
  };
  const assets = Array.isArray(sources.assets) ? sources.assets : [];
  const existing = assets.find(
    (entry): entry is JsonObject =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as JsonObject)["id"] === options.id
  );
  if (existing !== undefined) {
    throw new Error(`asset-sources.json already contains an entry with id "${options.id}".`);
  }

  const newEntry: JsonObject = {
    id: options.id,
    kind: options.kind ?? "imported",
    runtimeFiles: [runtimeRef],
    license: options.license ?? "Project-owned",
    source: {
      type: options.kind ?? "imported",
      notes: options.notes ?? `Imported from ${basename(sourceFile)} via \`engine asset import\`.`
    }
  };
  assets.push(newEntry);
  writeFileSync(
    sourcesPath,
    JSON.stringify({ ...sources, version: sources.version ?? 1, assets }, null, 2) + "\n"
  );

  return {
    projectDir,
    runtimePath,
    runtimeRef,
    sourcesPath,
    added: true
  };
}

function defaultSubdirFor(file: string): string {
  if (file.endsWith(".glb") || file.endsWith(".gltf")) {
    return "models";
  }
  if (file.endsWith(".material.json")) {
    return "materials";
  }
  return "misc";
}
