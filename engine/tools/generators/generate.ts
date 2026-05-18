// S81 KABOOM-GENERATOR-FRAMEWORK. Driver around a `Generator` function:
//
//   1. Build a SeededRng from the supplied seed.
//   2. Invoke the generator with the rng + params (pure call).
//   3. Run a lightweight self-check against the scene shape (required
//      keys, entity-id uniqueness, GridPosition-in-bounds when a Grid
//      singleton is emitted).
//
// Project code calls `runGenerator` directly. The CLI shim in
// engine/tools/cli.ts wraps this with a dynamic import of the project's
// generator module so the same code path serves agent-authored calls.
//
// The framework intentionally stops at structural validation; full
// schema validation lives in `engine check` and runs against the
// written-to-disk JSON. That keeps each tool single-purpose.

import { createSeededRng } from "../../core/util/seeded-rng";
import type { GeneratedScene, GenerateResult, Generator } from "./types";

export type RunGeneratorOptions = {
  seed: number;
  generator: Generator;
  params?: Record<string, unknown>;
};

export function runGenerator(options: RunGeneratorOptions): GenerateResult {
  const rng = createSeededRng(options.seed);
  const scene = options.generator(rng, options.params ?? {});
  const diagnostics = validateScene(scene);
  return { scene, diagnostics };
}

function validateScene(scene: GeneratedScene): GenerateResult["diagnostics"] {
  const diagnostics: Array<{
    code: string;
    severity: "error" | "warning";
    message: string;
    path?: string;
  }> = [];

  if (typeof scene.id !== "string" || scene.id.length === 0) {
    diagnostics.push({
      code: "AGF_GENERATOR_MISSING_SCENE_ID",
      severity: "error",
      message: "Generator output is missing a string `id`.",
      path: "$.id"
    });
  }

  if (!Array.isArray(scene.entities) || scene.entities.length === 0) {
    diagnostics.push({
      code: "AGF_GENERATOR_EMPTY_ENTITIES",
      severity: "error",
      message: "Generator output has no entities — scene loaders reject empty scenes.",
      path: "$.entities"
    });
    return diagnostics;
  }

  const seenIds = new Map<string, number>();
  let gridConfigCount = 0;
  let gridSizeX: number | undefined;
  let gridSizeZ: number | undefined;
  scene.entities.forEach((entity, index) => {
    if (typeof entity?.id !== "string") {
      diagnostics.push({
        code: "AGF_GENERATOR_ENTITY_MISSING_ID",
        severity: "error",
        message: `entities[${index}] is missing a string id.`,
        path: `$.entities[${index}].id`
      });
      return;
    }
    if (seenIds.has(entity.id)) {
      diagnostics.push({
        code: "AGF_GENERATOR_DUPLICATE_ENTITY_ID",
        severity: "error",
        message: `Duplicate entity id "${entity.id}" — first at $.entities[${seenIds.get(entity.id)}].`,
        path: `$.entities[${index}].id`
      });
      return;
    }
    seenIds.set(entity.id, index);

    const components = entity.components as Record<string, unknown> | undefined;
    if (components === undefined) return;
    const grid = components["Grid"];
    if (isObject(grid)) {
      gridConfigCount += 1;
      if (typeof grid["sizeX"] === "number") gridSizeX = grid["sizeX"];
      if (typeof grid["sizeZ"] === "number") gridSizeZ = grid["sizeZ"];
    }
  });

  if (gridConfigCount > 1) {
    diagnostics.push({
      code: "AGF_GENERATOR_DUPLICATE_GRID",
      severity: "error",
      message: `Generator emitted ${gridConfigCount} Grid components — the Grid is a singleton.`
    });
  }

  if (gridSizeX !== undefined && gridSizeZ !== undefined) {
    scene.entities.forEach((entity, index) => {
      const gp = (entity.components as Record<string, unknown> | undefined)?.["GridPosition"];
      if (!isObject(gp)) return;
      const gx = typeof gp["gx"] === "number" ? gp["gx"] : NaN;
      const gz = typeof gp["gz"] === "number" ? gp["gz"] : NaN;
      if (!Number.isFinite(gx) || !Number.isFinite(gz)) return;
      if (gx < 0 || gx >= gridSizeX! || gz < 0 || gz >= gridSizeZ!) {
        diagnostics.push({
          code: "AGF_GENERATOR_GRID_POSITION_OUT_OF_BOUNDS",
          severity: "error",
          message: `GridPosition (gx=${gx}, gz=${gz}) outside Grid extents (sizeX=${gridSizeX}, sizeZ=${gridSizeZ}).`,
          path: `$.entities[${index}].components.GridPosition`
        });
      }
    });
  }

  return diagnostics;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
