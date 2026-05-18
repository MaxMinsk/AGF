// S81 KABOOM-GENERATOR-FRAMEWORK. Type contract for seed-driven scene
// generators. A generator is a pure function: same (seed, params) → same
// JSON scene. The framework guarantees the RNG it hands the generator
// is the only entropy source available; relying on Math.random or Date
// is a non-determinism bug.

import type { SeededRng } from "../../core/util/seeded-rng";

/** Shape of a scene file emitted by a generator. Matches scene.schema.json. */
export type GeneratedScene = {
  id: string;
  entities: Array<{
    id: string;
    components: Record<string, unknown>;
  }>;
  // Optional pass-through fields that scene.schema.json allows.
  instances?: ReadonlyArray<unknown>;
  environment?: unknown;
};

/**
 * Generator function. Receives a deterministic RNG + per-template params,
 * returns a JSON scene. Generators never read the global Date, never call
 * Math.random — every random decision flows through `rng`.
 */
export type Generator = (rng: SeededRng, params: Record<string, unknown>) => GeneratedScene;

/**
 * Result of running a generator + the post-generation validation pass.
 * The `diagnostics` array carries the same shape as `engine check` so
 * tooling renders both identically.
 */
export type GenerateResult = {
  scene: GeneratedScene;
  diagnostics: ReadonlyArray<{
    code: string;
    severity: "error" | "warning";
    message: string;
    path?: string;
  }>;
};
