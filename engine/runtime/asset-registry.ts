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
};

export class AssetRegistry {
  private readonly baseUrl: string;
  private readonly loaders: AssetLoader[] = [];
  private readonly cache = new Map<AssetRef, Promise<unknown>>();

  constructor(options: AssetRegistryOptions) {
    this.baseUrl = options.baseUrl;
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
      return Promise.reject(new Error(`No asset loader matches reference "${ref}".`));
    }

    const promise = loader.load(this.urlFor(ref));
    this.cache.set(ref, promise);

    // Drop failed loads from the cache so callers can retry after the issue is fixed.
    promise.catch(() => {
      if (this.cache.get(ref) === promise) {
        this.cache.delete(ref);
      }
    });

    return promise as Promise<T>;
  }
}
