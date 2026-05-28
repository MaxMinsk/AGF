// S169 ENGINE-WANG-AUTOTILE (GDP-2026-05-28-002) — family registry.
//
// Generic Wang-tile family registry used by `WangTileResolverSystem`.
// Project bootstrap calls `registerWangTileFamily(family)` for each
// tile family it wants the resolver to handle. Families are validated
// against `schemas/components/wang-tile.schema.json` at registration
// time so a malformed family fails fast at bootstrap.
//
// Engine-only primitive — knows nothing about specific games. The
// first consumer (Kaboom Crew, GDP-2026-05-28-004) is a SEPARATE
// follow-up story.
//
// Duplicate variant ENTRIES are allowed — the same `meshKey` can
// legitimately appear at multiple bitmask indices (e.g. the same
// "corner" mesh rotated four ways to handle the four corner
// bitmasks). Duplicate FAMILY NAMES are not — the registry refuses
// to overwrite an existing family. Tests call
// `clearWangTileFamilies()` between cases.

import Ajv, { type ValidateFunction } from "ajv";
import wangTileSchema from "../../../schemas/components/wang-tile.schema.json" with { type: "json" };

/** S169 — one variant in a family. `meshKey` is opaque to the engine; the consumer resolves it. */
export type WangTileVariant = {
  meshKey: string;
  rotationY?: number;
  mirrorX?: boolean;
};

/** S169 — full family. `variants.length` MUST be 16. */
export type WangTileFamily = {
  name: string;
  variants: ReadonlyArray<WangTileVariant>;
};

let cachedValidator: ValidateFunction | undefined;

function getFamilyValidator(): ValidateFunction {
  if (cachedValidator !== undefined) return cachedValidator;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const definitions = (wangTileSchema as { definitions: Record<string, object> }).definitions;
  const compiled = ajv.compile({
    $ref: "#/definitions/wangTileFamily",
    definitions
  });
  cachedValidator = compiled;
  return compiled;
}

const families = new Map<string, WangTileFamily>();

/**
 * Register a Wang tile family. Throws on:
 *   - non-string / empty `name`;
 *   - duplicate `name` (call `clearWangTileFamilies()` in tests to reset);
 *   - `variants.length !== 16`;
 *   - any schema-validation failure (missing meshKey, wrong types, etc.).
 *
 * Duplicate variant entries (same mesh at multiple indices) are
 * allowed — see the module header for the rationale.
 */
export function registerWangTileFamily(family: WangTileFamily): void {
  // Defensive runtime checks — callers may come from JSON / dev-bridge
  // payloads where TS types are not enforced. Widen to `unknown` for the
  // checks so the narrowing inside the function doesn't kick the type to
  // `never` after the typeof guard.
  const raw = family as unknown;
  if (raw === null || typeof raw !== "object") {
    throw new Error("registerWangTileFamily: family must be an object");
  }
  const candidate = raw as { name?: unknown; variants?: unknown };
  if (typeof candidate.name !== "string" || candidate.name.length === 0) {
    throw new Error("registerWangTileFamily: family.name must be a non-empty string");
  }
  const name = candidate.name;
  if (families.has(name)) {
    throw new Error(
      `registerWangTileFamily: duplicate name "${name}" — call clearWangTileFamilies() in tests or unregister first.`
    );
  }
  if (!Array.isArray(candidate.variants) || candidate.variants.length !== 16) {
    throw new Error(
      `registerWangTileFamily: family "${name}" must have exactly 16 variants (got ${
        Array.isArray(candidate.variants) ? candidate.variants.length : "non-array"
      }).`
    );
  }
  const validate = getFamilyValidator();
  const ok = validate(family);
  if (!ok) {
    const errs = (validate.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim())
      .join("; ");
    throw new Error(`registerWangTileFamily: invalid family "${name}" — ${errs}`);
  }
  families.set(name, family);
}

export function getWangTileFamily(name: string): WangTileFamily | undefined {
  return families.get(name);
}

/** Sorted list of registered family names. Useful for diagnostics + the future doctor surface. */
export function listWangTileFamilies(): string[] {
  return [...families.keys()].sort();
}

/** Test seam — production code shouldn't reach for this. */
export function clearWangTileFamilies(): void {
  families.clear();
}
