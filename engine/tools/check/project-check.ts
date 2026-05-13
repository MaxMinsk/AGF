import Ajv, { type AnySchema, type ErrorObject, type ValidateFunction } from "ajv";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

type SchemaKey = "project" | "scene" | "assetSources";

type CompiledSchemas = Record<SchemaKey, ValidateFunction>;

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

const componentNames = ["Camera", "MeshRenderer", "Name", "Transform"] as const;
const primitiveMeshes = new Set(["box", "sphere", "plane"]);

const schemaPaths: Record<SchemaKey, string> = {
  project: "schemas/project.schema.json",
  scene: "schemas/scene.schema.json",
  assetSources: "schemas/asset-sources.schema.json"
};

let compiledSchemas: CompiledSchemas | undefined;

export function checkProject(projectDirInput: string): CheckResult {
  const projectDir = resolve(projectDirInput);
  const diagnostics: Diagnostic[] = [];
  const projectPath = resolve(projectDir, "project.json");

  const projectJson = readJson(projectPath, projectDir);
  if (!projectJson.ok) {
    return result(projectDir, [projectJson.diagnostic]);
  }

  const projectSchemaDiagnostics = validateWithSchema("project", projectJson.data, projectPath, projectDir);
  diagnostics.push(...projectSchemaDiagnostics);

  if (!isJsonObject(projectJson.data)) {
    return result(projectDir, diagnostics);
  }

  const assetRootValue = projectJson.data["assetRoot"];
  const assetRoot = typeof assetRootValue === "string" ? assetRootValue : undefined;
  if (assetRoot !== undefined) {
    validateAssetRoot(projectDir, assetRoot, diagnostics);
  }

  const startSceneValue = projectJson.data["startScene"];
  const startScene = typeof startSceneValue === "string" ? startSceneValue : undefined;
  if (startScene !== undefined) {
    validateStartScene(projectDir, startScene, assetRoot, diagnostics);
  }

  return result(projectDir, diagnostics);
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

  diagnostics.push(...validateWithSchema("scene", sceneJson.data, scenePath, projectDir));
  diagnostics.push(...detectDuplicateEntityIds(sceneJson.data, scenePath, projectDir));

  if (assetRoot !== undefined && isDirectory(resolve(projectDir, assetRoot))) {
    diagnostics.push(...validateSceneAssetReferences(sceneJson.data, scenePath, projectDir, assetRoot));
  }
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

  diagnostics.push(...validateWithSchema("assetSources", sourceMetadataJson.data, sourceMetadataPath, projectDir));
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
    if (!isJsonObject(meshRenderer)) {
      return;
    }

    const mesh = meshRenderer["mesh"];
    if (typeof mesh === "string" && !primitiveMeshes.has(mesh)) {
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
          ? "Add the runtime mesh file, update the reference, or use a primitive mesh: box, sphere, plane."
          : "Add the material file under assetRoot or remove the material reference until materials are implemented."
    }
  ];
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

function validateWithSchema(
  schemaKey: SchemaKey,
  data: JsonValue,
  filePath: string,
  projectDir: string
): Diagnostic[] {
  const validate = getCompiledSchemas()[schemaKey];
  const valid = validate(data);
  if (valid) {
    return [];
  }

  return (validate.errors ?? []).map((error) => ajvErrorToDiagnostic(error, filePath, projectDir));
}

function getCompiledSchemas(): CompiledSchemas {
  if (compiledSchemas !== undefined) {
    return compiledSchemas;
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  compiledSchemas = {
    project: ajv.compile(readSchema(schemaPaths.project)),
    scene: ajv.compile(readSchema(schemaPaths.scene)),
    assetSources: ajv.compile(readSchema(schemaPaths.assetSources))
  };

  return compiledSchemas;
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

function ajvErrorToDiagnostic(error: ErrorObject, filePath: string, projectDir: string): Diagnostic {
  const additionalProperty =
    typeof error.params["additionalProperty"] === "string" ? error.params["additionalProperty"] : undefined;
  const missingProperty = typeof error.params["missingProperty"] === "string" ? error.params["missingProperty"] : undefined;
  const path = jsonPointerToPath(error.instancePath, additionalProperty ?? missingProperty);
  const propertyText = additionalProperty ?? missingProperty;
  const suggestion = suggestionForAjvError(error, path);

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
    return "AGF_SCHEMA_UNKNOWN_PROPERTY";
  }

  if (error.keyword === "required") {
    return "AGF_SCHEMA_REQUIRED_PROPERTY";
  }

  return "AGF_SCHEMA_VALIDATION_FAILED";
}

function messageForAjvError(error: ErrorObject, propertyText: string | undefined): string {
  if (error.keyword === "additionalProperties" && propertyText !== undefined) {
    return `Unknown property "${propertyText}".`;
  }

  if (error.keyword === "required" && propertyText !== undefined) {
    return `Missing required property "${propertyText}".`;
  }

  return error.message ?? "Schema validation failed.";
}

function suggestionForAjvError(error: ErrorObject, path: string): string | undefined {
  if (error.keyword === "additionalProperties" && path.includes(".components.")) {
    return `Use one of these components: ${componentNames.join(", ")}.`;
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
