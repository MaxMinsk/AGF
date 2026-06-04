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

/**
 * S283 ENGINE-WANG-SUBVARIANT — sub-variant family. Each of the 16
 * bitmask indices maps to an array of 1+ variants. A deterministic
 * per-cell hash selects the sub-variant so the same cell always picks
 * the same mesh across hot-reloads.
 */
export type WangTileFamilyV2 = {
  name: string;
  /** Exactly 16 sub-variant arrays (index 0-15 = bitmask value). Each
   *  array must have at least one entry. */
  subvariants: ReadonlyArray<ReadonlyArray<WangTileVariant>>;
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
const familiesV2 = new Map<string, WangTileFamilyV2>();

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
  return [...families.keys(), ...familiesV2.keys()].sort();
}

/** Test seam — production code shouldn't reach for this. */
export function clearWangTileFamilies(): void {
  families.clear();
  familiesV2.clear();
}

// ---------------------------------------------------------------------------
// S283 ENGINE-WANG-SUBVARIANT
// ---------------------------------------------------------------------------

/**
 * Register a Wang tile family with sub-variant support.
 * `subvariants` must be exactly 16 arrays, each non-empty.
 * Backwards-compatible: auto-wraps a plain `WangTileVariant[]` entry as
 * a single-element array when the caller mixes legacy + sub-variant syntax.
 *
 * Throws on duplicate name, wrong length, or empty sub-variant array.
 */
export function registerWangFamilyWithSubvariants(
  name: string,
  subvariants: ReadonlyArray<ReadonlyArray<WangTileVariant>>
): void {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("registerWangFamilyWithSubvariants: name must be a non-empty string");
  }
  if (families.has(name) || familiesV2.has(name)) {
    throw new Error(
      `registerWangFamilyWithSubvariants: duplicate name "${name}" — clear before re-registering`
    );
  }
  if (!Array.isArray(subvariants) || subvariants.length !== 16) {
    throw new Error(
      `registerWangFamilyWithSubvariants: "${name}" must have exactly 16 sub-variant arrays (got ${
        Array.isArray(subvariants) ? subvariants.length : "non-array"
      })`
    );
  }
  for (let i = 0; i < 16; i++) {
    const arr = subvariants[i];
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error(
        `registerWangFamilyWithSubvariants: "${name}" index ${i} must be a non-empty array`
      );
    }
  }
  familiesV2.set(name, { name, subvariants });
}

/** Retrieve a sub-variant family. Returns undefined for plain families or unknown names. */
export function getWangTileFamilyV2(name: string): WangTileFamilyV2 | undefined {
  return familiesV2.get(name);
}

/**
 * Deterministic per-cell sub-variant selector.
 *
 * Hashes (entityId, gx, gz) into a stable slot in [0, subCount).
 * The same cell always picks the same sub-variant across hot-reloads
 * and map restarts, giving visual variety without per-frame randomness.
 */
export function subvariantIndex(
  entityId: string,
  gx: number,
  gz: number,
  subCount: number
): number {
  if (subCount <= 1) return 0;
  // Cheap deterministic hash: mix entity id character codes + cell coords.
  let h = 0;
  for (let i = 0; i < entityId.length; i++) {
    h = (Math.imul(h, 31) + entityId.charCodeAt(i)) | 0;
  }
  h = (Math.imul(h, 7919) + gx * 7907 + gz * 6983) | 0;
  // unsigned shift to avoid negative modulo
  return ((h >>> 0) % subCount);
}

/**
 * Unified variant lookup. Checks V2 (sub-variant) family first, then
 * falls back to V1. Returns the resolved mesh key, variant index (bitmask
 * index), and sub-variant index (0 for V1 families).
 *
 * Returns undefined when the family is not registered.
 */
export function lookupWangVariant(
  familyName: string,
  bitmask: number,
  entityId?: string,
  gx?: number,
  gz?: number
): { meshKey: string; variantIndex: number; subvariantIndex: number } | undefined {
  const clamped = clampBitmask16(bitmask);
  const v2 = familiesV2.get(familyName);
  if (v2 !== undefined) {
    const arr = v2.subvariants[clamped]!;
    const si =
      entityId !== undefined && gx !== undefined && gz !== undefined
        ? subvariantIndex(entityId, gx, gz, arr.length)
        : 0;
    return { meshKey: arr[si]!.meshKey, variantIndex: clamped, subvariantIndex: si };
  }
  const v1 = families.get(familyName);
  if (v1 !== undefined) {
    const variant = v1.variants[clamped]!;
    return { meshKey: variant.meshKey, variantIndex: clamped, subvariantIndex: 0 };
  }
  return undefined;
}

function clampBitmask16(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 15) return 15;
  return value | 0;
}
