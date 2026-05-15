import type {
  ComponentData,
  ComponentName,
  EntityId,
  SceneInput
} from "./types";

export type QueryHandle = {
  readonly components: ReadonlyArray<ComponentName>;
  run(): EntityId[];
};

export class World {
  private readonly entities = new Set<EntityId>();
  private readonly stores = new Map<ComponentName, Map<EntityId, ComponentData>>();
  /** Incremented on every structural change so cached queries can detect staleness cheaply. */
  private revision = 0;
  /**
   * Bumped on every mutation — `addEntity` / `removeEntity` /
   * `setComponent` / `removeComponent`. Exposed via `mutationCounter()`
   * so the runtime's render-on-demand mode can skip `renderer.render()`
   * for frames where no system touched ECS state. Coarse signal — false
   * positives only (a system writing back the same value still bumps).
   */
  private mutations = 0;
  /**
   * Per-component data-revision counter. Bumped on every `setComponent`
   * (including overwrites — that's the whole point) and zeroed on
   * `removeComponent`. Consumers that need to detect "did this entity's
   * Transform actually change?" check `componentRevision(id, "Transform")`
   * against their last-seen value. Cheap number compare; no allocations.
   * M16-cache uses this for the LocalToWorld resolver cache.
   */
  private readonly componentRevisions = new Map<ComponentName, Map<EntityId, number>>();
  /**
   * Incremental dirty queues per component. setComponent / removeComponent /
   * removeEntity push affected entity ids into the matching set. Consumers
   * call `consumeDirty(name)` to read + clear in one step. Designed for
   * frame-update systems that want O(touched) rather than O(N) scans
   * (M16-cache-b TransformResolveSystem). The dirty set is a derived index,
   * not authoring state — see CLAUDE.md "one ECS source of truth" rule.
   */
  private readonly dirtyByComponent = new Map<ComponentName, Set<EntityId>>();

  static fromScene(scene: SceneInput): World {
    const world = new World();
    for (const entity of scene.entities) {
      world.addEntity(entity.id);
      for (const [name, data] of Object.entries(entity.components)) {
        world.setComponent(entity.id, name, data);
      }
    }
    return world;
  }

  addEntity(id: EntityId): void {
    if (this.entities.has(id)) {
      throw new Error(`Entity "${id}" already exists.`);
    }
    this.entities.add(id);
    this.revision += 1;
    this.mutations += 1;
  }

  removeEntity(id: EntityId): void {
    if (!this.entities.delete(id)) {
      return;
    }
    for (const [name, store] of this.stores) {
      if (store.delete(id)) this.markDirty(name, id);
    }
    for (const revisions of this.componentRevisions.values()) {
      revisions.delete(id);
    }
    this.revision += 1;
    this.mutations += 1;
  }

  /**
   * Monotonic counter bumped on every mutation (entity add / remove,
   * component set / remove). Used by the runtime's render-on-demand
   * mode to skip `renderer.render()` when nothing changed this frame.
   */
  mutationCounter(): number {
    return this.mutations;
  }

  hasEntity(id: EntityId): boolean {
    return this.entities.has(id);
  }

  entityCount(): number {
    return this.entities.size;
  }

  entityIds(): EntityId[] {
    return [...this.entities];
  }

  setComponent(id: EntityId, name: ComponentName, data: ComponentData): void {
    if (!this.entities.has(id)) {
      throw new Error(`Cannot set component "${name}" on missing entity "${id}".`);
    }
    let store = this.stores.get(name);
    let structural = false;
    if (store === undefined) {
      store = new Map();
      this.stores.set(name, store);
      structural = true;
    } else if (!store.has(id)) {
      structural = true;
    }
    store.set(id, data);
    if (structural) {
      this.revision += 1;
    }
    this.mutations += 1;
    this.bumpComponentRevision(id, name);
    this.markDirty(name, id);
  }

  getComponent<T = ComponentData>(id: EntityId, name: ComponentName): T | undefined {
    const store = this.stores.get(name);
    if (store === undefined) {
      return undefined;
    }
    return store.get(id) as T | undefined;
  }

  hasComponent(id: EntityId, name: ComponentName): boolean {
    return this.stores.get(name)?.has(id) ?? false;
  }

  removeComponent(id: EntityId, name: ComponentName): void {
    const store = this.stores.get(name);
    if (store === undefined) {
      return;
    }
    if (store.delete(id)) {
      this.revision += 1;
      this.mutations += 1;
      this.componentRevisions.get(name)?.delete(id);
      this.markDirty(name, id);
    }
  }

  /**
   * Read + clear the dirty set for a component. Returns every entity whose
   * `setComponent(id, name, ...)` or `removeComponent(id, name)` fired since
   * the previous `consumeDirty(name)` call (or since World construction).
   * Returns an empty set if nothing changed.
   */
  consumeDirty(name: ComponentName): Set<EntityId> {
    const set = this.dirtyByComponent.get(name);
    if (set === undefined) return new Set();
    this.dirtyByComponent.delete(name);
    return set;
  }

  /** Number of entries currently in the dirty queue. Useful for diagnostics + bench probes. */
  dirtySize(name: ComponentName): number {
    return this.dirtyByComponent.get(name)?.size ?? 0;
  }

  private markDirty(name: ComponentName, id: EntityId): void {
    let set = this.dirtyByComponent.get(name);
    if (set === undefined) {
      set = new Set();
      this.dirtyByComponent.set(name, set);
    }
    set.add(id);
  }

  /**
   * Per-component data-revision counter. Returns 0 if the entity has never
   * carried this component; otherwise a strictly-increasing number bumped on
   * every `setComponent(id, name, ...)` call. Designed to be checked by
   * cache layers that need to detect "did this entity's data change since I
   * last looked?" without diffing the payload.
   */
  componentRevision(id: EntityId, name: ComponentName): number {
    return this.componentRevisions.get(name)?.get(id) ?? 0;
  }

  private bumpComponentRevision(id: EntityId, name: ComponentName): void {
    let store = this.componentRevisions.get(name);
    if (store === undefined) {
      store = new Map();
      this.componentRevisions.set(name, store);
    }
    store.set(id, (store.get(id) ?? 0) + 1);
  }

  /**
   * Snapshot of the structural-revision counter. Bumped on entity add/remove
   * and on component add/remove (NOT on data overwrites). Cached query handles
   * use this to decide when to invalidate their memoised result.
   */
  getRevision(): number {
    return this.revision;
  }

  /**
   * Returns a stable handle that memoises its result between structural
   * changes. Component-data overwrites do NOT invalidate the cache because
   * they cannot change which entities match the filter.
   */
  createQuery(componentNames: ReadonlyArray<ComponentName>): QueryHandle {
    const components = [...componentNames];
    let cachedRevision = -1;
    let cached: EntityId[] = [];
    return {
      components,
      run: (): EntityId[] => {
        if (this.revision !== cachedRevision) {
          cached = this.query(components);
          cachedRevision = this.revision;
        }
        return cached;
      }
    };
  }

  componentNames(): ComponentName[] {
    return [...this.stores.keys()];
  }

  query(componentNames: ReadonlyArray<ComponentName>): EntityId[] {
    if (componentNames.length === 0) {
      return [...this.entities];
    }

    let pivotStore: Map<EntityId, ComponentData> | undefined;
    let pivotSize = Infinity;
    for (const name of componentNames) {
      const store = this.stores.get(name);
      if (store === undefined) {
        return [];
      }
      if (store.size < pivotSize) {
        pivotStore = store;
        pivotSize = store.size;
      }
    }
    if (pivotStore === undefined) {
      return [];
    }

    if (componentNames.length === 1) {
      return [...pivotStore.keys()];
    }

    const matches: EntityId[] = [];
    for (const entityId of pivotStore.keys()) {
      let ok = true;
      for (const name of componentNames) {
        const store = this.stores.get(name);
        if (store === pivotStore) {
          continue;
        }
        if (store === undefined || !store.has(entityId)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        matches.push(entityId);
      }
    }
    return matches;
  }
}
