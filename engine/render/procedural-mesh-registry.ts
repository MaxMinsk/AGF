// S101 AGF-PROCMESH-REGISTRY: project-agnostic registry of seeded
// procedural mesh builders. Any `MeshRenderer.mesh` value of the form
// `procedural:<key>[#<seedHash>]` resolves through this registry instead
// of the hardcoded primitive switch in `mesh-handle-registry.ts`.
//
// Projects register a `(seedHash) => BufferGeometry` builder at
// bootstrap; the registry caches the result by `<key>:<seedHash>` so
// repeat acquires for the same seed reuse the geometry. The seed string
// is opaque to the registry — projects choose its meaning.

import type { BufferGeometry } from "three";

export type ProceduralMeshBuilder = (seedHash: string) => BufferGeometry;

export type ProceduralMeshRegistry = {
  /** Register a builder under `key`. Re-registering drops any cached geometries from the previous builder. */
  register(key: string, builder: ProceduralMeshBuilder): void;
  /** Does the registry know how to build geometries for this key? */
  has(key: string): boolean;
  /** Live snapshot of every registered key. */
  keys(): IterableIterator<string>;
  /** Number of cached `<key>:<seedHash>` geometries currently held. */
  cacheSize(): number;
  /** Resolve a `procedural:<key>[#<seedHash>]` mesh ref to a (cached) BufferGeometry, or undefined when the key isn't registered. */
  resolve(meshRef: string): BufferGeometry | undefined;
  /** Drop every cached geometry for a single key. Use when the builder's algorithm changes (HMR, version bump). */
  invalidate(key: string): void;
  /** Drop the entire cache. */
  clear(): void;
};

export function isProceduralMeshRef(ref: string): boolean {
  return ref.startsWith("procedural:");
}

export function parseProceduralRef(ref: string): { key: string; seed: string } | undefined {
  if (!isProceduralMeshRef(ref)) return undefined;
  const rest = ref.slice("procedural:".length);
  if (rest.length === 0) return undefined;
  const hashIdx = rest.indexOf("#");
  if (hashIdx === -1) return { key: rest, seed: "default" };
  const key = rest.slice(0, hashIdx);
  if (key.length === 0) return undefined;
  return { key, seed: rest.slice(hashIdx + 1) };
}

export function createProceduralMeshRegistry(): ProceduralMeshRegistry {
  const builders = new Map<string, ProceduralMeshBuilder>();
  const cache = new Map<string, BufferGeometry>();

  const dropCacheFor = (key: string): void => {
    const prefix = `${key}#`;
    for (const cacheKey of [...cache.keys()]) {
      if (cacheKey.startsWith(prefix)) cache.delete(cacheKey);
    }
  };

  return {
    register(key, builder): void {
      builders.set(key, builder);
      dropCacheFor(key);
    },
    has(key): boolean {
      return builders.has(key);
    },
    keys(): IterableIterator<string> {
      return builders.keys();
    },
    cacheSize(): number {
      return cache.size;
    },
    resolve(ref): BufferGeometry | undefined {
      const parsed = parseProceduralRef(ref);
      if (parsed === undefined) return undefined;
      const builder = builders.get(parsed.key);
      if (builder === undefined) return undefined;
      const cacheKey = `${parsed.key}#${parsed.seed}`;
      const cached = cache.get(cacheKey);
      if (cached !== undefined) return cached;
      const geom = builder(parsed.seed);
      cache.set(cacheKey, geom);
      return geom;
    },
    invalidate(key): void {
      dropCacheFor(key);
    },
    clear(): void {
      cache.clear();
    }
  };
}
