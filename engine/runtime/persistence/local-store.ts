// Pluggable local-store interface backing the runtime's save / load API.
//
// Two implementations ship in v0:
//   - `createMemoryStore()` — a Map-backed in-process store. Used by tests
//     and any headless context where IndexedDB is not available.
//   - `createIndexedDbStore(dbName)` — browser-only, persists across page
//     reloads. Wraps a single object store keyed by string.
//
// The runtime's save/load layer picks one of these at construction time.
// Neither implementation knows anything about AGF semantics — they store
// opaque JSON.

export interface LocalStore {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Drop everything. Tests and `runtime.clearSave({ all: true })` use this. */
  clearAll?(): Promise<void>;
}

/** In-memory store, useful for tests and headless contexts. */
export function createMemoryStore(): LocalStore {
  const data = new Map<string, unknown>();
  return {
    async get(key) {
      return data.get(key);
    },
    async set(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      data.delete(key);
    },
    async clearAll() {
      data.clear();
    }
  };
}

/**
 * Browser-only IndexedDB adapter. Wraps a single object store named
 * `agf-saves` inside `dbName`. Throws if `indexedDB` is unavailable on the
 * platform; callers should fall back to `createMemoryStore()` in that case.
 */
export function createIndexedDbStore(dbName: string): LocalStore {
  const g = globalThis as { indexedDB?: IDBFactory };
  if (g.indexedDB === undefined) {
    throw new Error("IndexedDB is not available in this environment.");
  }
  const factory = g.indexedDB;
  const STORE = "agf-saves";

  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const request = factory.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    });

  // IDBRequest is invariant in its T (because of `result: T`), so we type
  // the helper with `IDBRequest<unknown>` and let callers cast their
  // narrower `IDBRequest<undefined>` returns through `as` at the call site.
  const tx = async (
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<unknown>
  ): Promise<unknown> => {
    const db = await open();
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        const request = run(store);
        request.onsuccess = (): void => resolve(request.result);
        request.onerror = (): void => reject(request.error ?? new Error("IndexedDB op failed"));
      });
    } finally {
      db.close();
    }
  };

  return {
    async get(key) {
      const value = await tx("readonly", (store) => store.get(key));
      return value === undefined ? undefined : value;
    },
    async set(key, value) {
      await tx("readwrite", (store) => store.put(value, key) as unknown as IDBRequest<unknown>);
    },
    async delete(key) {
      await tx("readwrite", (store) => store.delete(key) as unknown as IDBRequest<unknown>);
    },
    async clearAll() {
      await tx("readwrite", (store) => store.clear() as unknown as IDBRequest<unknown>);
    }
  };
}

/**
 * Compose a save key from project + profile + slot. Slot defaults to
 * `"default"`. The format is intentionally hyphen-separated so an agent or a
 * dev can inspect IndexedDB entries by eye.
 */
export function saveKey(projectId: string, profile: string, slot: string = "default"): string {
  return `agf/${projectId}/${profile}/${slot}`;
}
