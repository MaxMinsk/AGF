// Project format versioning — central constants used by `engine check`,
// `engine migrate` and any future runtime guards. Bump the supported range
// when introducing a breaking schema change.

/** Highest format version this engine build supports. */
export const CURRENT_FORMAT_VERSION = 1;

/** Lowest format version this engine build can still read directly. */
export const MIN_SUPPORTED_FORMAT_VERSION = 1;

/** Reads `agfFormatVersion` if present; returns undefined when absent. */
export function readFormatVersion(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const raw = (value as Record<string, unknown>)["agfFormatVersion"];
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1) {
    return raw;
  }
  return undefined;
}
