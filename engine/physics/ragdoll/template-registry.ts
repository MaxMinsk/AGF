// S126 KABOOM-RAGDOLL-MODULE foundation — template registry.
//
// Project bootstrap calls `registerRagdollTemplate(key, template)` for
// each ragdoll skeleton it wants the engine to handle. The future
// RagdollSpawnSystem (S127+) reads RagdollSpawnRequest, looks up the
// template by key, and spawns Rapier rigid bodies + joints per the
// template's bodies[] / joints[] declarations.
//
// Templates are validated against schemas/components/ragdoll.schema.json
// at registration time so a malformed template fails fast at bootstrap
// rather than at first-spawn (where Rapier would crash on a bad
// dimensions array or unknown shape).

import Ajv, { type ValidateFunction } from "ajv";
import ragdollSchema from "../../../schemas/components/ragdoll.schema.json" with { type: "json" };

/** S126 — body definition; one entry per rigid body in the template. */
export type RagdollBodyDef = {
  name: string;
  shape: "box" | "capsule" | "sphere";
  dimensions: [number, number, number];
  anchor?: [number, number, number];
  mass?: number;
  linearDamping?: number;
  angularDamping?: number;
};

/** S126 — joint definition; one entry per constraint between two bodies. */
export type RagdollJointDef = {
  name: string;
  bodyA: string;
  bodyB: string;
  type: "ball" | "revolute" | "fixed";
  anchorA?: [number, number, number];
  anchorB?: [number, number, number];
  axis?: [number, number, number];
  limitMin?: number;
  limitMax?: number;
};

export type RagdollTemplate = {
  bodies: RagdollBodyDef[];
  joints?: RagdollJointDef[];
  linearDamping?: number;
  angularDamping?: number;
};

// Compile the ragdollTemplate schema once at module load. The JSON
// schema is inlined via a Vite/Node JSON import so this module stays
// browser-safe (no node:fs).
let cachedValidator: ValidateFunction | undefined;

function getTemplateValidator(): ValidateFunction {
  if (cachedValidator !== undefined) return cachedValidator;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const definitions = (ragdollSchema as { definitions: Record<string, object> }).definitions;
  const compiled = ajv.compile({
    $ref: "#/definitions/ragdollTemplate",
    definitions
  });
  cachedValidator = compiled;
  return compiled;
}

const templates = new Map<string, RagdollTemplate>();

/**
 * Register a ragdoll template by key. Validates against the schema
 * bundle; throws with the AJV error path on bad shapes. Throws on
 * duplicate key registration.
 */
export function registerRagdollTemplate(key: string, template: RagdollTemplate): void {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("registerRagdollTemplate: key must be a non-empty string");
  }
  if (templates.has(key)) {
    throw new Error(`registerRagdollTemplate: duplicate key "${key}" — call clearRagdollTemplates() in tests or unregister first.`);
  }
  const validate = getTemplateValidator();
  const ok = validate(template);
  if (!ok) {
    const errs = (validate.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim())
      .join("; ");
    throw new Error(`registerRagdollTemplate: invalid template for "${key}" — ${errs}`);
  }
  templates.set(key, template);
}

export function getRagdollTemplate(key: string): RagdollTemplate | undefined {
  return templates.get(key);
}

export function listRagdollTemplates(): string[] {
  return [...templates.keys()].sort();
}

/** S126 — primarily for tests; production code shouldn't reach for this. */
export function clearRagdollTemplates(): void {
  templates.clear();
}
