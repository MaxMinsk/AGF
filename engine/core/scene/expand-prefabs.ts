// Pure scene → flat-entities expansion.
//
// A scene may carry `instances: [{ id, prefab, overrides? }]` alongside its
// `entities` array. Each instance is a deferred entity declaration: the
// engine looks up the prefab in a registry and produces a regular entity
// whose components are the prefab's defaults merged with the instance's
// overrides.
//
// This module is pure and lives under engine/core — no filesystem reads, no
// renderer coupling. The CLI / runtime layer is responsible for loading
// prefab files and passing them in as a registry.

import type { SceneEntityInput, SceneInput } from "../ecs/types";

export type PrefabDefinition = {
  id: string;
  components: Record<string, unknown>;
  tags?: ReadonlyArray<string>;
  description?: string;
};

export type SceneInstance = {
  id: string;
  prefab: string;
  overrides?: Record<string, unknown>;
};

export type SceneWithInstances = SceneInput & {
  instances?: ReadonlyArray<SceneInstance>;
};

export type ExpansionDiagnostic = {
  severity: "error";
  code: "AGF_SCENE_INSTANCE_PREFAB_MISSING" | "AGF_SCENE_INSTANCE_DUPLICATE_ID";
  message: string;
  /** Index into `scene.instances` that triggered the diagnostic. */
  instanceIndex: number;
};

export type ExpansionResult = {
  scene: SceneInput;
  diagnostics: ExpansionDiagnostic[];
};

/**
 * Expand a scene's `instances` into regular entities and return the result
 * with a flat `entities` array. The input scene is not mutated. Diagnostics
 * are collected per-instance; an unknown prefab does not abort the whole
 * expansion, the caller decides how to act on the diagnostics list.
 */
export function expandScenePrefabs(
  scene: SceneWithInstances,
  registry: ReadonlyMap<string, PrefabDefinition>
): ExpansionResult {
  const diagnostics: ExpansionDiagnostic[] = [];
  const entities: SceneEntityInput[] = scene.entities.slice();
  const ids = new Set<string>(entities.map((entity) => entity.id));

  const instances = scene.instances ?? [];
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index] as SceneInstance;
    if (ids.has(instance.id)) {
      diagnostics.push({
        severity: "error",
        code: "AGF_SCENE_INSTANCE_DUPLICATE_ID",
        instanceIndex: index,
        message: `Instance id "${instance.id}" collides with an existing entity.`
      });
      continue;
    }
    const prefab = registry.get(instance.prefab);
    if (prefab === undefined) {
      diagnostics.push({
        severity: "error",
        code: "AGF_SCENE_INSTANCE_PREFAB_MISSING",
        instanceIndex: index,
        message: `Instance "${instance.id}" references unknown prefab "${instance.prefab}".`
      });
      continue;
    }

    const components = mergeComponents(prefab.components, instance.overrides);
    entities.push({ id: instance.id, components });
    ids.add(instance.id);
  }

  return {
    scene: { id: scene.id, entities },
    diagnostics
  };
}

function mergeComponents(
  base: Record<string, unknown>,
  overrides: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (overrides === undefined || Object.keys(overrides).length === 0) {
    return { ...base };
  }
  const merged: Record<string, unknown> = { ...base };
  for (const [name, value] of Object.entries(overrides)) {
    const current = merged[name];
    if (
      current !== undefined &&
      typeof current === "object" &&
      current !== null &&
      !Array.isArray(current) &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      // Shallow merge: prefab.Transform.position is kept unless the override
      // also touches position. Deep merge is out of scope for v0 — callers
      // can ship a fresh component value if they need full replacement.
      merged[name] = { ...(current as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      merged[name] = value;
    }
  }
  return merged;
}
