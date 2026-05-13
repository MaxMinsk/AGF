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
  }

  removeEntity(id: EntityId): void {
    if (!this.entities.delete(id)) {
      return;
    }
    for (const store of this.stores.values()) {
      store.delete(id);
    }
    this.revision += 1;
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
    }
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
