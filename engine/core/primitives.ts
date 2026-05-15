// Single source of truth for built-in primitive mesh names.
//
// Five sites previously hand-rolled the same Set — the registry / batcher /
// project-check / project-doctor / scene-extensions schema enum. Adding a
// primitive meant touching all five places (S54 cylinder addition surfaced
// the smell). Now the list lives here; consumers import the constant + a
// type-narrow helper.
//
// Lives under `engine/core` so renderer, runtime, tools and tests can all
// import it without crossing the import-boundary rule (`engine/core` is
// dependency-free).

export type PrimitiveMeshName = "box" | "sphere" | "cylinder" | "plane";

/**
 * Frozen, ordered, deduplicated. `ReadonlySet<string>` (not the narrow
 * `PrimitiveMeshName`) so callers can pass arbitrary scene JSON strings
 * directly into `.has(name)` without a cast. Use `isPrimitiveMesh()` for
 * type narrowing when the result needs to flow into a switch.
 */
export const PRIMITIVE_MESHES: ReadonlySet<string> = new Set<string>([
  "box",
  "sphere",
  "cylinder",
  "plane"
]);

/** Array form for schema enum codegen and human-readable diagnostics. */
export const PRIMITIVE_MESH_NAMES: ReadonlyArray<PrimitiveMeshName> = [
  "box",
  "sphere",
  "cylinder",
  "plane"
];

/** Type-narrowing helper. */
export function isPrimitiveMesh(name: string): name is PrimitiveMeshName {
  return PRIMITIVE_MESHES.has(name as PrimitiveMeshName);
}
