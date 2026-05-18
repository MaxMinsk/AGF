import type { DiagnosticsBus } from "./diagnostics/diagnostics-bus";

export type AssetRef = string;

export type AssetLoader<T = unknown> = {
  readonly name: string;
  matches(ref: AssetRef): boolean;
  load(url: string): Promise<T>;
};

export type AssetRegistryOptions = {
  /** Base URL used to resolve relative `ref` values into fetchable URLs. */
  baseUrl: string;
  loaders?: ReadonlyArray<AssetLoader>;
  /**
   * Optional diagnostics bus. When set, the registry emits
   * `AGF_RUNTIME_ASSET_NO_LOADER` and `AGF_RUNTIME_ASSET_LOAD_FAILED` events.
   */
  diagnostics?: DiagnosticsBus;
};

export class AssetRegistry {
  private readonly baseUrl: string;
  private readonly loaders: AssetLoader[] = [];
  private readonly cache = new Map<AssetRef, Promise<unknown>>();
  // S86 AGF-ASSET-INVENTORY-PROBE. Mirror the cache key set with a
  // resolved-status map so the /__agf/asset-inventory endpoint can
  // report which refs settled vs which are still in flight.
  private readonly status = new Map<AssetRef, "loaded" | "pending" | "failed">();
  private readonly diagnostics: DiagnosticsBus | undefined;

  constructor(options: AssetRegistryOptions) {
    this.baseUrl = options.baseUrl;
    this.diagnostics = options.diagnostics;
    if (options.loaders !== undefined) {
      this.loaders.push(...options.loaders);
    }
  }

  register(loader: AssetLoader): void {
    this.loaders.push(loader);
  }

  loaderNames(): string[] {
    return this.loaders.map((loader) => loader.name);
  }

  has(ref: AssetRef): boolean {
    return this.cache.has(ref);
  }

  /**
   * S86 AGF-ASSET-INVENTORY-PROBE. Snapshot of every ref the registry
   * has touched + its status — `loaded` (resolved), `pending`
   * (in-flight), or `failed` (settled with rejection, then cleared
   * from the cache and re-listed here). Probe-only, no side effects.
   */
  inventory(): Array<{ ref: AssetRef; status: "loaded" | "pending" | "failed" }> {
    const out: Array<{ ref: AssetRef; status: "loaded" | "pending" | "failed" }> = [];
    for (const [ref, status] of this.status) {
      out.push({ ref, status });
    }
    return out;
  }

  /** Drop a cached load so the next get(ref) re-fetches. Used by HMR. */
  invalidate(ref: AssetRef): boolean {
    this.status.delete(ref);
    return this.cache.delete(ref);
  }

  urlFor(ref: AssetRef): string {
    return new URL(ref, this.baseUrl).href;
  }

  get<T = unknown>(ref: AssetRef): Promise<T> {
    const cached = this.cache.get(ref);
    if (cached !== undefined) {
      return cached as Promise<T>;
    }

    const loader = this.loaders.find((candidate) => candidate.matches(ref));
    if (loader === undefined) {
      this.diagnostics?.emit({
        severity: "error",
        code: "AGF_RUNTIME_ASSET_NO_LOADER",
        source: "asset-registry",
        message: `No asset loader matches reference "${ref}".`,
        assetRef: ref
      });
      return Promise.reject(new Error(`No asset loader matches reference "${ref}".`));
    }

    const promise = loader.load(this.urlFor(ref));
    this.cache.set(ref, promise);
    this.status.set(ref, "pending");

    // Drop failed loads from the cache so callers can retry after the issue is fixed.
    promise
      .then((value) => {
        if (this.cache.get(ref) === promise) this.status.set(ref, "loaded");
        return value;
      })
      .catch((error: unknown) => {
        if (this.cache.get(ref) === promise) {
          this.cache.delete(ref);
        }
        this.status.set(ref, "failed");
        const reason = error instanceof Error ? error.message : String(error);
        this.diagnostics?.emit({
          severity: "error",
          code: "AGF_RUNTIME_ASSET_LOAD_FAILED",
          source: "asset-registry",
          message: `Failed to load asset "${ref}": ${reason}`,
          assetRef: ref,
          details: { loader: loader.name, reason }
        });
      });

    return promise as Promise<T>;
  }
}
