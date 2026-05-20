// S53 RENDER-pool-registry.
//
// Centralises the handle counter + Map bookkeeping pattern that three
// adapter pools (InstancedMesh bucketer, BatchedMesh bucketer, particle
// pool) had grown independently. Each pool used to declare:
//
//   private readonly <pool> = new Map<Handle, Entry>();
//   private next<Pool>Handle = 1;
//
// ... and inlined `this.next++` / `Map.set` / `Map.delete` in every
// acquire/release path. The Entry shape differs per pool (InstancedMesh
// + capacity + live-slot Set vs BatchedMesh + live-instance Set vs
// additive InstancedMesh + capacity), but the bookkeeping is identical.
//
// `RenderPoolRegistry<Entry>` keeps that shape — caller still owns the
// Entry contents; the registry just hands out monotonic numeric handles
// and looks them up.
//
// Public-API contract: every method maps directly to the previous
// `Map<H, E>` + counter pattern. Existing adapter call-sites keep
// working unchanged (`this.<pool>.get(handle)` etc). The next stories
// build on top: typed `BucketSpec` keys (story 2), `acquirePool`
// dispatcher with a tagged `PoolHandle` union (story 3).

export class RenderPoolRegistry<Entry> {
  private readonly entries = new Map<number, Entry>();
  private nextHandle = 1;
  // S88 AGF-POOL-INVENTORY-API. Peak live-size; bumps on acquire,
  // never decreases on release. Useful for "did this pool ever hold
  // anything" warm-up diagnostics. Reset only via `reset()`.
  private peakLive = 0;

  /** Allocate a fresh monotonic handle and store the entry. */
  acquire(entry: Entry): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.entries.set(handle, entry);
    if (this.entries.size > this.peakLive) this.peakLive = this.entries.size;
    return handle;
  }

  /**
   * Drop the entry from the registry. Returns the entry the caller
   * just released so it can run its own dispose pattern (scene-remove,
   * mesh.dispose, material.dispose) without re-fetching it.
   */
  release(handle: number): Entry | undefined {
    const entry = this.entries.get(handle);
    if (entry === undefined) return undefined;
    this.entries.delete(handle);
    return entry;
  }

  get(handle: number): Entry | undefined {
    return this.entries.get(handle);
  }

  has(handle: number): boolean {
    return this.entries.has(handle);
  }

  size(): number {
    return this.entries.size;
  }

  values(): IterableIterator<Entry> {
    return this.entries.values();
  }

  entriesIter(): IterableIterator<[number, Entry]> {
    return this.entries.entries();
  }

  /**
   * Iterate + remove every entry. Returns each in turn so the caller
   * can run the per-entry dispose pattern. After draining, `size() === 0`.
   * Used by adapter teardown paths (e.g., context loss) and tests.
   */
  *drain(): Generator<Entry> {
    for (const entry of this.entries.values()) yield entry;
    this.entries.clear();
  }

  /** S88 AGF-POOL-INVENTORY-API. Highest `size()` ever observed since last `reset()`. */
  peak(): number {
    return this.peakLive;
  }

  /**
   * S88 AGF-POOL-INVENTORY-API. Forget the handle counter + peak.
   * Used by adapter teardown / unit tests. `entries` should already
   * be empty (callers drain first); we don't force-clear so a
   * caller never leaks entries past a registry reset.
   */
  reset(): void {
    this.nextHandle = 1;
    this.peakLive = 0;
  }
}
