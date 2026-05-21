import Ajv, { type AnySchema, type ErrorObject, type ValidateFunction } from "ajv";
import { loadBundledSceneSchema } from "../schemas/load-scene-schema";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PRIMITIVE_MESHES, PRIMITIVE_MESH_NAMES } from "../../core/primitives";
import { CURRENT_FORMAT_VERSION, MIN_SUPPORTED_FORMAT_VERSION } from "./format-version";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

type StaticSchemaKey = "project" | "assetSources" | "material" | "playtest" | "prefab";

type StaticSchemas = Record<StaticSchemaKey, ValidateFunction>;

type ReadJsonResult =
  | {
      ok: true;
      data: JsonValue;
    }
  | {
      ok: false;
      diagnostic: Diagnostic;
    };

export type DiagnosticSeverity = "error" | "warning";

export type Diagnostic = {
  severity: DiagnosticSeverity;
  code: string;
  file: string;
  path: string;
  message: string;
  suggestion?: string;
};

export type CheckResult = {
  ok: boolean;
  projectDir: string;
  diagnostics: Diagnostic[];
};

const builtInComponentNames = [
  "Camera",
  "MeshRenderer",
  "Name",
  "Networked",
  "PlayerControlled",
  "Presence",
  "Spin",
  "Transform"
] as const;
const primitiveMeshes = PRIMITIVE_MESHES;

const staticSchemaPaths: Record<StaticSchemaKey, string> = {
  project: "schemas/project.schema.json",
  assetSources: "schemas/asset-sources.schema.json",
  material: "schemas/material.schema.json",
  playtest: "schemas/playtest.schema.json",
  prefab: "schemas/prefab.schema.json"
};
const baseSceneSchemaPath = "schemas/scene.schema.json";

let staticSchemasCache: StaticSchemas | undefined;

type SceneSchemaForProject = {
  validate: ValidateFunction;
  componentNames: ReadonlyArray<string>;
};

const sceneSchemaCache = new Map<string, SceneSchemaForProject>();

export function checkProject(projectDirInput: string): CheckResult {
  const projectDir = resolve(projectDirInput);
  const diagnostics: Diagnostic[] = [];
  const projectPath = resolve(projectDir, "project.json");

  const projectJson = readJson(projectPath, projectDir);
  if (!projectJson.ok) {
    return result(projectDir, [projectJson.diagnostic]);
  }

  diagnostics.push(...validateStaticSchema("project", projectJson.data, projectPath, projectDir));

  if (!isJsonObject(projectJson.data)) {
    return result(projectDir, diagnostics);
  }

  diagnostics.push(...validateFormatVersion(projectJson.data, projectPath, projectDir));

  const assetRootValue = projectJson.data["assetRoot"];
  const assetRoot = typeof assetRootValue === "string" ? assetRootValue : undefined;
  if (assetRoot !== undefined) {
    validateAssetRoot(projectDir, assetRoot, diagnostics);
    validateMaterialFiles(projectDir, assetRoot, diagnostics);
  }

  const startSceneValue = projectJson.data["startScene"];
  const startScene = typeof startSceneValue === "string" ? startSceneValue : undefined;
  if (startScene !== undefined) {
    validateStartScene(projectDir, startScene, assetRoot, diagnostics);
  }

  validatePlaytestScenarios(projectDir, diagnostics);
  validatePrefabFiles(projectDir, diagnostics);

  return result(projectDir, diagnostics);
}

function validatePrefabFiles(projectDir: string, diagnostics: Diagnostic[]): void {
  const prefabsDir = resolve(projectDir, "prefabs");
  if (!isDirectory(prefabsDir)) {
    return;
  }
  const validate = getStaticSchemas().prefab;
  for (const entry of readdirSyncSafe(prefabsDir)) {
    if (!entry.endsWith(".prefab.json")) continue;
    const filePath = resolve(prefabsDir, entry);
    const parsed = readJson(filePath, projectDir);
    if (!parsed.ok) {
      diagnostics.push(parsed.diagnostic);
      continue;
    }
    if (!validate(parsed.data)) {
      for (const error of validate.errors ?? []) {
        diagnostics.push({
          severity: "error",
          code: "AGF_PREFAB_INVALID",
          file: toProjectRelativeFile(filePath, projectDir),
          path: error.instancePath === "" ? "$" : `$${error.instancePath}`,
          message: `Prefab schema violation: ${error.message ?? "invalid"} ${JSON.stringify(error.params)}`
        });
      }
    }
  }
}

function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export function formatDiagnostics(resultToFormat: CheckResult): string {
  if (resultToFormat.diagnostics.length === 0) {
    return `OK: ${resultToFormat.projectDir}`;
  }

  return resultToFormat.diagnostics
    .map((diagnostic) => {
      const suggestion = diagnostic.suggestion === undefined ? "" : `\n  suggestion: ${diagnostic.suggestion}`;
      return `${diagnostic.severity.toUpperCase()} ${diagnostic.code} ${diagnostic.file} ${diagnostic.path}\n  ${diagnostic.message}${suggestion}`;
    })
    .join("\n\n");
}

function validateStartScene(
  projectDir: string,
  startScene: string,
  assetRoot: string | undefined,
  diagnostics: Diagnostic[]
): void {
  const scenePath = resolve(projectDir, startScene);
  if (!existsSync(scenePath)) {
    diagnostics.push({
      severity: "error",
      code: "AGF_PROJECT_START_SCENE_MISSING",
      file: "project.json",
      path: "$.startScene",
      message: `Start scene "${startScene}" does not exist.`,
      suggestion: "Create the scene file or update project.json to point to an existing scene."
    });
    return;
  }

  const sceneJson = readJson(scenePath, projectDir);
  if (!sceneJson.ok) {
    diagnostics.push(sceneJson.diagnostic);
    return;
  }

  const sceneSchema = getSceneSchemaForProject(projectDir);
  diagnostics.push(...runValidator(sceneSchema.validate, sceneJson.data, scenePath, projectDir, sceneSchema.componentNames));
  diagnostics.push(...detectDuplicateEntityIds(sceneJson.data, scenePath, projectDir));
  diagnostics.push(...validateTransformHierarchy(sceneJson.data, scenePath, projectDir));
  diagnostics.push(...validatePhysicsColliders(sceneJson.data, scenePath, projectDir));
  diagnostics.push(...validateScenePrefabInstances(sceneJson.data, scenePath, projectDir));
  diagnostics.push(...validateGridComponents(sceneJson.data, scenePath, projectDir));

  if (assetRoot !== undefined && isDirectory(resolve(projectDir, assetRoot))) {
    diagnostics.push(...validateSceneAssetReferences(sceneJson.data, scenePath, projectDir, assetRoot));
  }
}

function validateScenePrefabInstances(
  sceneData: JsonValue,
  scenePath: string,
  projectDir: string
): Diagnostic[] {
  if (!isJsonObject(sceneData) || !Array.isArray(sceneData["instances"])) {
    return [];
  }
  const file = toProjectRelativeFile(scenePath, projectDir);
  const out: Diagnostic[] = [];

  // Build the prefab-id set from `prefabs/*.prefab.json` ids (not filenames),
  // mirroring what the runtime registry sees.
  const knownPrefabIds = new Set<string>();
  const prefabsDir = resolve(projectDir, "prefabs");
  if (isDirectory(prefabsDir)) {
    for (const entry of readdirSyncSafe(prefabsDir)) {
      if (!entry.endsWith(".prefab.json")) continue;
      const parsed = readJson(resolve(prefabsDir, entry), projectDir);
      if (!parsed.ok || !isJsonObject(parsed.data)) continue;
      const id = parsed.data["id"];
      if (typeof id === "string") knownPrefabIds.add(id);
    }
  }

  // Collect existing entity ids so we can flag duplicate instance ids.
  const entityIds = new Set<string>();
  if (Array.isArray(sceneData["entities"])) {
    for (const entity of sceneData["entities"]) {
      if (isJsonObject(entity) && typeof entity["id"] === "string") {
        entityIds.add(entity["id"]);
      }
    }
  }

  const instances = sceneData["instances"];
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index];
    if (!isJsonObject(instance)) continue;
    const id = typeof instance["id"] === "string" ? instance["id"] : undefined;
    const prefab = typeof instance["prefab"] === "string" ? instance["prefab"] : undefined;
    if (id !== undefined && entityIds.has(id)) {
      out.push({
        severity: "error",
        code: "AGF_SCENE_INSTANCE_DUPLICATE_ID",
        file,
        path: `$.instances[${index}].id`,
        message: `Instance id "${id}" collides with an existing entity id.`,
        suggestion: "Rename the instance or remove the duplicate entity."
      });
    } else if (id !== undefined) {
      entityIds.add(id);
    }
    if (prefab !== undefined && !knownPrefabIds.has(prefab)) {
      out.push({
        severity: "error",
        code: "AGF_SCENE_INSTANCE_PREFAB_MISSING",
        file,
        path: `$.instances[${index}].prefab`,
        message: `Instance "${id ?? "?"}" references unknown prefab "${prefab}".`,
        suggestion:
          knownPrefabIds.size > 0
            ? `Known prefab ids: ${[...knownPrefabIds].sort().join(", ")}.`
            : "Add a `<projectDir>/prefabs/<id>.prefab.json` file declaring this prefab."
      });
    }
  }
  return out;
}

function validatePlaytestScenarios(projectDir: string, diagnostics: Diagnostic[]): void {
  const playtestsDir = resolve(projectDir, "playtests");
  if (!isDirectory(playtestsDir)) {
    return;
  }

  const entries = readdirSync(playtestsDir);
  for (const entry of entries) {
    if (!entry.endsWith(".playtest.json")) {
      continue;
    }
    const filePath = resolve(playtestsDir, entry);
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      continue;
    }
    const json = readJson(filePath, projectDir);
    if (!json.ok) {
      diagnostics.push(json.diagnostic);
      continue;
    }
    diagnostics.push(...validateStaticSchema("playtest", json.data, filePath, projectDir));
  }
}

function validateMaterialFiles(projectDir: string, assetRoot: string, diagnostics: Diagnostic[]): void {
  const materialsDir = resolve(projectDir, assetRoot, "runtime/materials");
  if (!isDirectory(materialsDir)) {
    return;
  }

  const entries = readdirSync(materialsDir);
  for (const entry of entries) {
    if (!entry.endsWith(".material.json")) {
      continue;
    }
    const materialPath = resolve(materialsDir, entry);
    if (!existsSync(materialPath) || statSync(materialPath).isDirectory()) {
      continue;
    }
    const json = readJson(materialPath, projectDir);
    if (!json.ok) {
      diagnostics.push(json.diagnostic);
      continue;
    }
    diagnostics.push(...validateStaticSchema("material", json.data, materialPath, projectDir));
  }
}

function validateFormatVersion(
  projectData: JsonObject,
  projectPath: string,
  projectDir: string
): Diagnostic[] {
  const raw = projectData["agfFormatVersion"];
  if (raw === undefined) {
    return [
      {
        severity: "warning",
        code: "AGF_FORMAT_VERSION_MISSING",
        file: toProjectRelativeFile(projectPath, projectDir),
        path: "$.agfFormatVersion",
        message: `Project does not declare an "agfFormatVersion" — engine assumes ${CURRENT_FORMAT_VERSION}.`,
        suggestion: `Add "agfFormatVersion": ${CURRENT_FORMAT_VERSION} to project.json so the migration tooling knows what shape this project follows.`
      }
    ];
  }
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) {
    return [
      {
        severity: "error",
        code: "AGF_SCHEMA_VALIDATION_FAILED",
        file: toProjectRelativeFile(projectPath, projectDir),
        path: "$.agfFormatVersion",
        message: `"agfFormatVersion" must be a positive integer; got ${JSON.stringify(raw)}.`,
        suggestion: `Use an integer in the supported range [${MIN_SUPPORTED_FORMAT_VERSION}, ${CURRENT_FORMAT_VERSION}].`
      }
    ];
  }
  if (raw > CURRENT_FORMAT_VERSION) {
    return [
      {
        severity: "error",
        code: "AGF_FORMAT_VERSION_UNSUPPORTED",
        file: toProjectRelativeFile(projectPath, projectDir),
        path: "$.agfFormatVersion",
        message: `Project declares agfFormatVersion ${raw}, but this engine only supports up to ${CURRENT_FORMAT_VERSION}.`,
        suggestion: "Upgrade the engine or migrate the project down to a supported version."
      }
    ];
  }
  if (raw < MIN_SUPPORTED_FORMAT_VERSION) {
    return [
      {
        severity: "warning",
        code: "AGF_FORMAT_VERSION_TOO_OLD",
        file: toProjectRelativeFile(projectPath, projectDir),
        path: "$.agfFormatVersion",
        message: `Project declares agfFormatVersion ${raw}, older than the engine's minimum (${MIN_SUPPORTED_FORMAT_VERSION}).`,
        suggestion: "Run `engine migrate <projectDir>` to upgrade the project."
      }
    ];
  }
  return [];
}

function validateAssetRoot(projectDir: string, assetRoot: string, diagnostics: Diagnostic[]): void {
  const assetRootPath = resolve(projectDir, assetRoot);
  if (!isDirectory(assetRootPath)) {
    diagnostics.push({
      severity: "error",
      code: "AGF_PROJECT_ASSET_ROOT_MISSING",
      file: "project.json",
      path: "$.assetRoot",
      message: `Asset root "${assetRoot}" does not exist or is not a directory.`,
      suggestion: "Create the asset directory or update project.json to point to the correct asset root."
    });
    return;
  }

  const sourceMetadataPath = resolve(assetRootPath, "_sources/asset-sources.json");
  if (!existsSync(sourceMetadataPath)) {
    diagnostics.push({
      severity: "warning",
      code: "AGF_ASSET_SOURCES_MISSING",
      file: toProjectRelativeFile(sourceMetadataPath, projectDir),
      path: "$",
      message: "Asset source metadata is missing.",
      suggestion: "Add assets/_sources/asset-sources.json so agents can track asset origin, license and runtime files."
    });
    return;
  }

  const sourceMetadataJson = readJson(sourceMetadataPath, projectDir);
  if (!sourceMetadataJson.ok) {
    diagnostics.push(sourceMetadataJson.diagnostic);
    return;
  }

  diagnostics.push(...validateStaticSchema("assetSources", sourceMetadataJson.data, sourceMetadataPath, projectDir));

  diagnostics.push(
    ...detectUndeclaredRuntimeAssets(
      projectDir,
      assetRootPath,
      sourceMetadataPath,
      sourceMetadataJson.data
    )
  );
}

function detectUndeclaredRuntimeAssets(
  projectDir: string,
  assetRootPath: string,
  sourceMetadataPath: string,
  sourceMetadata: JsonValue
): Diagnostic[] {
  const declared = new Set<string>();
  const declaredEntries: Array<{ index: number; ref: string }> = [];
  if (isJsonObject(sourceMetadata) && Array.isArray(sourceMetadata["assets"])) {
    sourceMetadata["assets"].forEach((asset, assetIndex) => {
      if (!isJsonObject(asset)) {
        return;
      }
      const runtimeFiles = asset["runtimeFiles"];
      if (!Array.isArray(runtimeFiles)) {
        return;
      }
      for (const file of runtimeFiles) {
        if (typeof file === "string" && file.length > 0) {
          const normalised = file.split("\\").join("/");
          declared.add(normalised);
          declaredEntries.push({ index: assetIndex, ref: normalised });
        }
      }
    });
  }

  const diagnostics: Diagnostic[] = [];

  // Reverse direction: every declared file must exist on disk.
  for (const entry of declaredEntries) {
    const onDisk = resolve(assetRootPath, entry.ref);
    if (!existsSync(onDisk) || statSync(onDisk).isDirectory()) {
      diagnostics.push({
        severity: "warning",
        code: "AGF_ASSET_SOURCE_RUNTIME_MISSING",
        file: toProjectRelativeFile(sourceMetadataPath, projectDir),
        path: `$.assets[${entry.index}].runtimeFiles`,
        message: `Declared runtime asset "${entry.ref}" does not exist on disk under assetRoot.`,
        suggestion: "Drop the runtimeFiles entry or restore the file (e.g. re-run the generator script that originally emitted it)."
      });
    }
  }

  const runtimeRoot = resolve(assetRootPath, "runtime");
  if (!isDirectory(runtimeRoot)) {
    return diagnostics;
  }

  const found: string[] = [];
  walkRuntimeFiles(runtimeRoot, "runtime", found);

  for (const ref of found) {
    if (!declared.has(ref)) {
      diagnostics.push({
        severity: "warning",
        code: "AGF_ASSET_RUNTIME_UNDECLARED",
        file: toProjectRelativeFile(sourceMetadataPath, projectDir),
        path: "$.assets",
        message: `Runtime asset "${ref}" is not declared in asset-sources.json.`,
        suggestion: "Add an entry under `assets[]` describing where this file came from (or remove the file if it is no longer used)."
      });
    }
  }
  return diagnostics;
}

function walkRuntimeFiles(dir: string, prefix: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) {
      continue;
    }
    const full = resolve(dir, entry);
    const stat = statSync(full);
    const relative = `${prefix}/${entry}`;
    if (stat.isDirectory()) {
      walkRuntimeFiles(full, relative, out);
    } else if (stat.isFile()) {
      out.push(relative);
    }
  }
}

function validateSceneAssetReferences(
  sceneData: JsonValue,
  scenePath: string,
  projectDir: string,
  assetRoot: string
): Diagnostic[] {
  if (!isJsonObject(sceneData) || !Array.isArray(sceneData["entities"])) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];
  const entities = sceneData["entities"];

  entities.forEach((entity, entityIndex) => {
    if (!isJsonObject(entity)) {
      return;
    }

    const components = entity["components"];
    if (!isJsonObject(components)) {
      return;
    }

    const meshRenderer = components["MeshRenderer"];
    if (isJsonObject(meshRenderer)) {
      const mesh = meshRenderer["mesh"];
      // S101 AGF-PROCMESH-REGISTRY: `procedural:<key>[#<seed>]` refs are
      // resolved through the renderer's procedural mesh registry at
      // runtime, not loaded from assetRoot. Doctor reports declared
      // keys + scene usage; engine-check stays out of the way.
      if (
        typeof mesh === "string" &&
        !primitiveMeshes.has(mesh) &&
        !mesh.startsWith("procedural:")
      ) {
        diagnostics.push(
          ...validateAssetReference({
            projectDir,
            assetRoot,
            scenePath,
            jsonPath: `$.entities[${entityIndex}].components.MeshRenderer.mesh`,
            reference: mesh,
            referenceKind: "mesh"
          })
        );
      }

      const material = meshRenderer["material"];
      if (typeof material === "string") {
        // S56 MESHRENDERER-material-path-validator: the runtime expects a
        // project-relative manifest path (`runtime/materials/<id>.material.json`)
        // — a bare manifest id silently fails to load. Flag the shape
        // before the file-existence check so the suggestion points at the
        // right fix instead of "file missing".
        if (!material.endsWith(".material.json")) {
          diagnostics.push({
            severity: "error",
            code: "AGF_MATERIAL_REF_INVALID",
            file: toProjectRelativeFile(scenePath, projectDir),
            path: `$.entities[${entityIndex}].components.MeshRenderer.material`,
            message: `MeshRenderer.material "${material}" is not a manifest path. The runtime expects a project-relative path ending in \`.material.json\`.`,
            suggestion: `Use the full path, e.g. \`runtime/materials/${material}.material.json\` if "${material}" is the manifest id.`
          });
        } else {
          diagnostics.push(
            ...validateAssetReference({
              projectDir,
              assetRoot,
              scenePath,
              jsonPath: `$.entities[${entityIndex}].components.MeshRenderer.material`,
              reference: material,
              referenceKind: "material"
            })
          );
        }
      }
    }

    // S54 ASSET-lod-metadata: per-level structural checks the JSON
    // schema can't express on its own — ascending distances and
    // mesh refs that point at real assets / primitives.
    const lod = components["LOD"];
    if (isJsonObject(lod) && Array.isArray(lod["levels"])) {
      diagnostics.push(
        ...validateLodComponent(lod["levels"], {
          projectDir,
          assetRoot,
          scenePath,
          entityIndex
        })
      );
    }
  });

  return diagnostics;
}

function validateLodComponent(
  levels: JsonValue[],
  ctx: {
    projectDir: string;
    assetRoot: string;
    scenePath: string;
    entityIndex: number;
  }
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seenDistances = new Set<number>();
  let previousDistance = -Infinity;
  levels.forEach((level, levelIndex) => {
    if (!isJsonObject(level)) return;
    const distance = level["maxDistance"];
    const mesh = level["mesh"];
    const basePath = `$.entities[${ctx.entityIndex}].components.LOD.levels[${levelIndex}]`;
    if (typeof distance === "number") {
      if (seenDistances.has(distance)) {
        diagnostics.push({
          severity: "error",
          code: "AGF_LOD_DISTANCE_DUPLICATE",
          file: toProjectRelativeFile(ctx.scenePath, ctx.projectDir),
          path: `${basePath}.maxDistance`,
          message: `LOD level ${levelIndex} reuses maxDistance ${distance}; each level needs a unique threshold.`,
          suggestion: "Adjust the distance so every LOD level has a distinct fall-off point."
        });
      }
      seenDistances.add(distance);
      if (distance <= previousDistance) {
        diagnostics.push({
          severity: "error",
          code: "AGF_LOD_DISTANCES_OUT_OF_ORDER",
          file: toProjectRelativeFile(ctx.scenePath, ctx.projectDir),
          path: `${basePath}.maxDistance`,
          message: `LOD level ${levelIndex} maxDistance ${distance} is not strictly greater than the previous level (${previousDistance}). LodSelectionSystem expects ascending order.`,
          suggestion: "Reorder the levels so maxDistance ascends and each level is the cheapest mesh that still looks acceptable up to that range."
        });
      }
      previousDistance = distance;
    }
    if (typeof mesh === "string" && !primitiveMeshes.has(mesh)) {
      const refDiagnostics = validateAssetReference({
        projectDir: ctx.projectDir,
        assetRoot: ctx.assetRoot,
        scenePath: ctx.scenePath,
        jsonPath: `${basePath}.mesh`,
        reference: mesh,
        referenceKind: "mesh"
      });
      // Re-tag the diagnostics so the agent sees an LOD-specific code.
      for (const diag of refDiagnostics) {
        diagnostics.push({
          ...diag,
          code: "AGF_LOD_MESH_MISSING"
        });
      }
    }
  });
  return diagnostics;
}

function validateAssetReference(input: {
  projectDir: string;
  assetRoot: string;
  scenePath: string;
  jsonPath: string;
  reference: string;
  referenceKind: "material" | "mesh";
}): Diagnostic[] {
  const assetRootPath = resolve(input.projectDir, input.assetRoot);
  const assetPath = resolve(assetRootPath, input.reference);

  if (isAbsolute(input.reference) || !isPathInside(assetRootPath, assetPath)) {
    return [
      {
        severity: "error",
        code: "AGF_ASSET_REFERENCE_INVALID",
        file: toProjectRelativeFile(input.scenePath, input.projectDir),
        path: input.jsonPath,
        message: `Asset reference "${input.reference}" must be relative to assetRoot and stay inside assetRoot.`,
        suggestion: "Use a project asset path such as runtime/models/example.glb or runtime/materials/example.material.json."
      }
    ];
  }

  if (existsSync(assetPath) && !statSync(assetPath).isDirectory()) {
    return [];
  }

  return [
    {
      severity: "error",
      code: "AGF_ASSET_REFERENCE_MISSING",
      file: toProjectRelativeFile(input.scenePath, input.projectDir),
      path: input.jsonPath,
      message: `${capitalize(input.referenceKind)} asset "${input.reference}" does not exist under assetRoot "${input.assetRoot}".`,
      suggestion:
        input.referenceKind === "mesh"
          ? `Add the runtime mesh file, update the reference, or use a primitive mesh: ${PRIMITIVE_MESH_NAMES.join(", ")}.`
          : "Add the material file under assetRoot or remove the material reference until materials are implemented."
    }
  ];
}

function validateTransformHierarchy(
  sceneData: JsonValue,
  scenePath: string,
  projectDir: string
): Diagnostic[] {
  if (!isJsonObject(sceneData) || !Array.isArray(sceneData["entities"])) {
    return [];
  }

  const entities = sceneData["entities"];
  const parentOf = new Map<string, string>();
  const entityIds = new Set<string>();
  const parentSourceIndex = new Map<string, number>();
  const diagnostics: Diagnostic[] = [];

  entities.forEach((entity, index) => {
    if (!isJsonObject(entity) || typeof entity["id"] !== "string") {
      return;
    }
    const entityId = entity["id"];
    entityIds.add(entityId);

    const components = isJsonObject(entity["components"]) ? entity["components"] : undefined;
    if (components === undefined) {
      return;
    }
    const transform = isJsonObject(components["Transform"]) ? components["Transform"] : undefined;
    if (transform === undefined) {
      return;
    }
    const parent = transform["parent"];
    if (typeof parent !== "string") {
      return;
    }

    parentSourceIndex.set(entityId, index);

    if (parent === entityId) {
      diagnostics.push({
        severity: "error",
        code: "AGF_TRANSFORM_PARENT_SELF",
        file: toProjectRelativeFile(scenePath, projectDir),
        path: `$.entities[${index}].components.Transform.parent`,
        message: `Entity "${entityId}" lists itself as its Transform.parent.`,
        suggestion: "Remove the parent field, or set it to the id of a different entity."
      });
      return;
    }
    parentOf.set(entityId, parent);
  });

  for (const [child, parent] of parentOf) {
    const index = parentSourceIndex.get(child);
    if (!entityIds.has(parent)) {
      diagnostics.push({
        severity: "error",
        code: "AGF_TRANSFORM_PARENT_MISSING",
        file: toProjectRelativeFile(scenePath, projectDir),
        path: `$.entities[${index}].components.Transform.parent`,
        message: `Entity "${child}" references parent "${parent}" which is not present in the scene.`,
        suggestion: "Add the parent entity, or remove the parent reference."
      });
      continue;
    }

    const seen = new Set<string>([child]);
    let cursor: string | undefined = parent;
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        diagnostics.push({
          severity: "error",
          code: "AGF_TRANSFORM_PARENT_CYCLE",
          file: toProjectRelativeFile(scenePath, projectDir),
          path: `$.entities[${index}].components.Transform.parent`,
          message: `Transform.parent chain starting at "${child}" forms a cycle through "${cursor}".`,
          suggestion: "Break the cycle: at most one entity in a chain may set parent."
        });
        break;
      }
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
  }

  return diagnostics;
}

function detectDuplicateEntityIds(sceneData: JsonValue, scenePath: string, projectDir: string): Diagnostic[] {
  if (!isJsonObject(sceneData) || !Array.isArray(sceneData["entities"])) {
    return [];
  }

  const firstSeenIndex = new Map<string, number>();
  const diagnostics: Diagnostic[] = [];
  const entities = sceneData["entities"];

  entities.forEach((entity, index) => {
    if (!isJsonObject(entity) || typeof entity["id"] !== "string") {
      return;
    }

    const entityId = entity["id"];
    const firstIndex = firstSeenIndex.get(entityId);
    if (firstIndex === undefined) {
      firstSeenIndex.set(entityId, index);
      return;
    }

    diagnostics.push({
      severity: "error",
      code: "AGF_SCENE_DUPLICATE_ENTITY_ID",
      file: toProjectRelativeFile(scenePath, projectDir),
      path: `$.entities[${index}].id`,
      message: `Duplicate entity id "${entityId}". First occurrence is at $.entities[${firstIndex}].id.`,
      suggestion: "Give every entity a stable unique id. Prefer readable ids such as camera.main or pickup.beacon-01."
    });
  });

  return diagnostics;
}

// S81 KABOOM-GRID-POSITION cross-component validation. Rules:
//   - At most one Grid component per scene (it's a singleton config).
//   - Every GridPosition.gx is in [0, Grid.sizeX); same for gz.
//   - GridPosition only makes sense when a Grid singleton exists.
function validateGridComponents(
  sceneData: JsonValue,
  scenePath: string,
  projectDir: string
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isJsonObject(sceneData) || !Array.isArray(sceneData["entities"])) return diagnostics;
  const file = toProjectRelativeFile(scenePath, projectDir);

  type GridConfig = { sizeX: number; sizeZ: number; entityIndex: number };
  const gridConfigs: GridConfig[] = [];
  const gridPositions: Array<{ entityIndex: number; gx: number; gz: number }> = [];

  sceneData["entities"].forEach((entity, index) => {
    if (!isJsonObject(entity)) return;
    const components = entity["components"];
    if (!isJsonObject(components)) return;
    const grid = components["Grid"];
    if (isJsonObject(grid)) {
      const sizeX = typeof grid["sizeX"] === "number" ? grid["sizeX"] : NaN;
      const sizeZ = typeof grid["sizeZ"] === "number" ? grid["sizeZ"] : NaN;
      gridConfigs.push({ sizeX, sizeZ, entityIndex: index });
    }
    const gp = components["GridPosition"];
    if (isJsonObject(gp)) {
      const gx = typeof gp["gx"] === "number" ? gp["gx"] : NaN;
      const gz = typeof gp["gz"] === "number" ? gp["gz"] : NaN;
      gridPositions.push({ entityIndex: index, gx, gz });
    }
  });

  if (gridConfigs.length > 1) {
    for (const cfg of gridConfigs.slice(1)) {
      diagnostics.push({
        severity: "error",
        code: "AGF_GRID_DUPLICATE_CONFIG",
        file,
        path: `$.entities[${cfg.entityIndex}].components.Grid`,
        message: `Multiple Grid components in scene. The Grid is a singleton; place it on one config entity.`,
        suggestion: `First Grid is at $.entities[${gridConfigs[0]!.entityIndex}].components.Grid.`
      });
    }
  }

  if (gridPositions.length > 0 && gridConfigs.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "AGF_GRID_POSITION_WITHOUT_GRID",
      file,
      path: `$.entities[${gridPositions[0]!.entityIndex}].components.GridPosition`,
      message: `Scene has GridPosition components but no Grid singleton. Add a Grid config entity with cellSize/sizeX/sizeZ.`
    });
  }

  if (gridConfigs.length > 0) {
    const cfg = gridConfigs[0]!;
    for (const gp of gridPositions) {
      if (!Number.isFinite(gp.gx) || !Number.isFinite(gp.gz)) continue;
      if (gp.gx < 0 || gp.gx >= cfg.sizeX || gp.gz < 0 || gp.gz >= cfg.sizeZ) {
        diagnostics.push({
          severity: "error",
          code: "AGF_GRID_POSITION_OUT_OF_BOUNDS",
          file,
          path: `$.entities[${gp.entityIndex}].components.GridPosition`,
          message: `GridPosition (gx=${gp.gx}, gz=${gp.gz}) is outside Grid extents (sizeX=${cfg.sizeX}, sizeZ=${cfg.sizeZ}).`,
          suggestion: `Move the entity inside the grid (0..${cfg.sizeX - 1}, 0..${cfg.sizeZ - 1}) or grow the Grid singleton.`
        });
      }
    }
  }

  return diagnostics;
}

const TRIMESH_VERTEX_WARN_THRESHOLD = 50_000;

function validatePhysicsColliders(
  sceneData: JsonValue,
  scenePath: string,
  projectDir: string
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isJsonObject(sceneData) || !Array.isArray(sceneData["entities"])) {
    return diagnostics;
  }
  sceneData["entities"].forEach((entity, index) => {
    if (!isJsonObject(entity)) return;
    const components = entity["components"];
    if (!isJsonObject(components)) return;
    const collider = components["Collider3D"];
    if (!isJsonObject(collider)) return;
    const kind = collider["kind"];
    const entityId = typeof entity["id"] === "string" ? entity["id"] : `entities[${index}]`;
    if (kind === "trimesh") {
      const body = components["RigidBody3D"];
      if (isJsonObject(body) && body["type"] === "dynamic") {
        diagnostics.push({
          severity: "error",
          code: "AGF_RIGIDBODY3D_DYNAMIC_TRIMESH",
          file: toProjectRelativeFile(scenePath, projectDir),
          path: `$.entities[${index}].components.RigidBody3D.type`,
          message: `Entity "${entityId}" pairs a trimesh collider with a dynamic body. Rapier does not support concave dynamic shapes — collisions are undefined.`,
          suggestion: "Either switch the body to type \"fixed\" / \"kinematicPosition\", or replace the trimesh with a convex hull / compound of primitives."
        });
      }
      const vertices = collider["vertices"];
      if (Array.isArray(vertices) && vertices.length / 3 > TRIMESH_VERTEX_WARN_THRESHOLD) {
        diagnostics.push({
          severity: "warning",
          code: "AGF_COLLIDER3D_TRIMESH_LARGE",
          file: toProjectRelativeFile(scenePath, projectDir),
          path: `$.entities[${index}].components.Collider3D.vertices`,
          message: `Trimesh on "${entityId}" carries ${Math.floor(vertices.length / 3)} vertices — over the ${TRIMESH_VERTEX_WARN_THRESHOLD}-vertex soft cap. Broadphase + narrow-phase cost scales with this number.`,
          suggestion: "Consider a heightfield, a primitive compound, or a decimated collision mesh authored alongside the visual."
        });
      }
    }
    if (kind === "heightfield") {
      const rows = collider["rows"];
      const columns = collider["columns"];
      const heights = collider["heights"];
      if (
        typeof rows === "number" &&
        typeof columns === "number" &&
        Array.isArray(heights) &&
        heights.length !== rows * columns
      ) {
        diagnostics.push({
          severity: "error",
          code: "AGF_COLLIDER3D_HEIGHTFIELD_DIMS",
          file: toProjectRelativeFile(scenePath, projectDir),
          path: `$.entities[${index}].components.Collider3D.heights`,
          message: `Heightfield on "${entityId}" declares rows=${rows} × columns=${columns} (${rows * columns} samples) but the heights array has ${heights.length} entries.`,
          suggestion: "Pad or trim the heights array so heights.length === rows * columns."
        });
      }
    }
  });
  return diagnostics;
}

function validateStaticSchema(
  schemaKey: StaticSchemaKey,
  data: JsonValue,
  filePath: string,
  projectDir: string
): Diagnostic[] {
  const validate = getStaticSchemas()[schemaKey];
  return runValidator(validate, data, filePath, projectDir, builtInComponentNames);
}

function runValidator(
  validate: ValidateFunction,
  data: JsonValue,
  filePath: string,
  projectDir: string,
  knownComponentNames: ReadonlyArray<string>
): Diagnostic[] {
  const valid = validate(data);
  if (valid) {
    return [];
  }
  return (validate.errors ?? []).map((error) =>
    ajvErrorToDiagnostic(error, filePath, projectDir, knownComponentNames)
  );
}

function getStaticSchemas(): StaticSchemas {
  if (staticSchemasCache !== undefined) {
    return staticSchemasCache;
  }
  const ajv = new Ajv({ allErrors: true, strict: false });
  staticSchemasCache = {
    project: ajv.compile(readSchema(staticSchemaPaths.project)),
    assetSources: ajv.compile(readSchema(staticSchemaPaths.assetSources)),
    material: ajv.compile(readSchema(staticSchemaPaths.material)),
    playtest: ajv.compile(readSchema(staticSchemaPaths.playtest)),
    prefab: ajv.compile(readSchema(staticSchemaPaths.prefab))
  };
  return staticSchemasCache;
}

function getSceneSchemaForProject(projectDir: string): SceneSchemaForProject {
  const cached = sceneSchemaCache.get(projectDir);
  if (cached !== undefined) {
    return cached;
  }

  // S48: scene.schema.json is the small entry point pointing at
  // schemas/components/*.schema.json + common.schema.json. The bundler
  // inlines every external $ref into a single in-memory schema so the
  // AJV compile + extension merge path below stays unchanged.
  const baseSchema = loadBundledSceneSchema() as JsonObject;
  const extensionPath = resolve(projectDir, "schemas/scene-extensions.schema.json");

  let mergedSchema: JsonObject = baseSchema;
  let extraComponentNames: string[] = [];

  if (existsSync(extensionPath)) {
    const extensions = JSON.parse(readFileSync(extensionPath, "utf8")) as JsonValue;
    if (isJsonObject(extensions)) {
      mergedSchema = mergeSceneExtensions(baseSchema, extensions);
      const extComponents = extensions["components"];
      if (isJsonObject(extComponents)) {
        extraComponentNames = Object.keys(extComponents);
      }
    }
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  const compiled: SceneSchemaForProject = {
    validate: ajv.compile(mergedSchema),
    componentNames: [...builtInComponentNames, ...extraComponentNames].sort()
  };
  sceneSchemaCache.set(projectDir, compiled);
  return compiled;
}

function mergeSceneExtensions(base: JsonObject, extensions: JsonObject): JsonObject {
  const merged = JSON.parse(JSON.stringify(base)) as JsonObject;
  const baseDefinitions = merged["definitions"];
  if (!isJsonObject(baseDefinitions)) {
    return merged;
  }

  const extComponents = extensions["components"];
  if (isJsonObject(extComponents)) {
    const entityDef = baseDefinitions["entity"];
    if (isJsonObject(entityDef)) {
      const entityProperties = entityDef["properties"];
      if (isJsonObject(entityProperties)) {
        const componentsDef = entityProperties["components"];
        if (isJsonObject(componentsDef)) {
          const componentsProperties = componentsDef["properties"];
          if (isJsonObject(componentsProperties)) {
            for (const [name, schema] of Object.entries(extComponents)) {
              componentsProperties[name] = schema;
            }
          }
        }
      }
    }
  }

  const extDefinitions = extensions["definitions"];
  if (isJsonObject(extDefinitions)) {
    for (const [name, schema] of Object.entries(extDefinitions)) {
      baseDefinitions[name] = schema;
    }
  }

  return merged;
}

function readSchema(schemaPath: string): AnySchema {
  const currentFile = fileURLToPath(import.meta.url);
  const repositoryRoot = resolve(dirname(currentFile), "../../..");
  return JSON.parse(readFileSync(resolve(repositoryRoot, schemaPath), "utf8")) as AnySchema;
}

function readJson(filePath: string, projectDir: string): ReadJsonResult {
  if (!existsSync(filePath)) {
    return {
      ok: false,
      diagnostic: {
        severity: "error",
        code: "AGF_FILE_MISSING",
        file: toProjectRelativeFile(filePath, projectDir),
        path: "$",
        message: "Required JSON file does not exist.",
        suggestion: "Create the file or update the project manifest to reference an existing file."
      }
    };
  }

  try {
    return {
      ok: true,
      data: JSON.parse(readFileSync(filePath, "utf8")) as JsonValue
    };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "Unknown JSON parse error.";
    return {
      ok: false,
      diagnostic: {
        severity: "error",
        code: "AGF_JSON_PARSE_FAILED",
        file: toProjectRelativeFile(filePath, projectDir),
        path: "$",
        message: `Could not parse JSON. ${reason}`,
        suggestion: "Fix the JSON syntax before running deeper validation."
      }
    };
  }
}

function ajvErrorToDiagnostic(
  error: ErrorObject,
  filePath: string,
  projectDir: string,
  knownComponentNames: ReadonlyArray<string>
): Diagnostic {
  const additionalProperty =
    typeof error.params["additionalProperty"] === "string" ? error.params["additionalProperty"] : undefined;
  const missingProperty = typeof error.params["missingProperty"] === "string" ? error.params["missingProperty"] : undefined;
  const path = jsonPointerToPath(error.instancePath, additionalProperty ?? missingProperty);
  const propertyText = additionalProperty ?? missingProperty;
  const suggestion = suggestionForAjvError(error, path, knownComponentNames);

  return {
    severity: "error",
    code: codeForAjvError(error),
    file: toProjectRelativeFile(filePath, projectDir),
    path,
    message: messageForAjvError(error, propertyText),
    ...(suggestion === undefined ? {} : { suggestion })
  };
}

function codeForAjvError(error: ErrorObject): string {
  if (error.keyword === "additionalProperties") {
    if (isComponentSlotPath(error.instancePath)) {
      return "AGF_SCHEMA_UNKNOWN_COMPONENT";
    }
    return "AGF_SCHEMA_UNKNOWN_PROPERTY";
  }

  if (error.keyword === "required") {
    return "AGF_SCHEMA_REQUIRED_PROPERTY";
  }

  return "AGF_SCHEMA_VALIDATION_FAILED";
}

function messageForAjvError(error: ErrorObject, propertyText: string | undefined): string {
  if (error.keyword === "additionalProperties" && propertyText !== undefined) {
    if (isComponentSlotPath(error.instancePath)) {
      return `Unknown component "${propertyText}".`;
    }
    return `Unknown property "${propertyText}".`;
  }

  if (error.keyword === "required" && propertyText !== undefined) {
    return `Missing required property "${propertyText}".`;
  }

  return error.message ?? "Schema validation failed.";
}

function suggestionForAjvError(
  error: ErrorObject,
  path: string,
  knownComponentNames: ReadonlyArray<string>
): string | undefined {
  if (error.keyword === "additionalProperties" && isComponentSlotPath(error.instancePath)) {
    const unknown =
      typeof error.params["additionalProperty"] === "string"
        ? error.params["additionalProperty"]
        : undefined;
    const nearest = unknown === undefined ? undefined : findNearestName(unknown, knownComponentNames);
    const known = `Known components: ${knownComponentNames.join(", ")}.`;
    if (nearest !== undefined) {
      return `Did you mean "${nearest}"? Add the component under <projectDir>/schemas/scene-extensions.schema.json if it is project-specific. ${known}`;
    }
    return `Add the component under <projectDir>/schemas/scene-extensions.schema.json if it is project-specific. ${known}`;
  }

  if (error.keyword === "additionalProperties") {
    return "Remove the unknown property or add it to the schema intentionally.";
  }

  if (error.keyword === "required") {
    return "Add the missing property using the schema defaults from the nearest example project.";
  }

  if (path.endsWith(".color") || path.endsWith(".background")) {
    return "Use a six-digit hex color such as #f7c948.";
  }

  return "Compare this file with examples/hello-3d for the smallest valid shape.";
}

function isComponentSlotPath(instancePath: string): boolean {
  return /\/entities\/\d+\/components$/.test(instancePath);
}

function findNearestName(input: string, candidates: ReadonlyArray<string>): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  const lowerInput = input.toLowerCase();
  let bestName: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshtein(lowerInput, candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = candidate;
    }
  }
  if (bestName === undefined) {
    return undefined;
  }
  const threshold = Math.max(2, Math.ceil(input.length / 3));
  return bestDistance <= threshold ? bestName : undefined;
}

function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }
  const previousRow = new Array<number>(b.length + 1);
  const currentRow = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) {
    previousRow[j] = j;
  }
  for (let i = 1; i <= a.length; i += 1) {
    currentRow[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      currentRow[j] = Math.min(
        (currentRow[j - 1] ?? 0) + 1,
        (previousRow[j] ?? 0) + 1,
        (previousRow[j - 1] ?? 0) + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      previousRow[j] = currentRow[j] ?? 0;
    }
  }
  return currentRow[b.length] ?? 0;
}

function jsonPointerToPath(pointer: string, appendedProperty: string | undefined): string {
  const segments = pointer
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));

  const base = segments.reduce((path, segment) => {
    if (/^\d+$/.test(segment)) {
      return `${path}[${segment}]`;
    }

    return `${path}.${segment}`;
  }, "$");

  if (appendedProperty === undefined) {
    return base;
  }

  return `${base}.${appendedProperty}`;
}

function toProjectRelativeFile(filePath: string, projectDir: string): string {
  const relativePath = relative(projectDir, filePath);
  return relativePath === "" ? "." : relativePath.split(sep).join("/");
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function isPathInside(rootPath: string, childPath: string): boolean {
  const relativePath = relative(rootPath, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function result(projectDir: string, diagnostics: Diagnostic[]): CheckResult {
  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    projectDir,
    diagnostics
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
