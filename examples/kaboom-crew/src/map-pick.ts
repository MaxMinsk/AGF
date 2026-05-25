// S140 — session-stable random map picker for the kaboom-crew solo
// default.
//
// Mirrors the S139 personality picker contract:
//   - explicit URL override (`?map=…`) wins when the value is a known
//     registry key.
//   - empty / unknown URL triggers a uniform random pick over the
//     registry keys, memoised once per page load so subsequent calls
//     (round restart, scene rebuild) return the same map.
//   - `_resetSessionMap()` test escape hatch resets the cache.

let _sessionMap: string | undefined;

export function resolveSessionMap(
  search: string | undefined,
  registry: ReadonlyMap<string, unknown>,
  rng: () => number = Math.random
): string {
  if (search !== undefined && search.length > 0) {
    try {
      const value = new URLSearchParams(search).get("map");
      if (value !== null && registry.has(value)) return value;
    } catch {
      // ignored — fall through to the random path
    }
  }
  if (_sessionMap === undefined) {
    const keys = Array.from(registry.keys());
    if (keys.length === 0) return "start"; // defensive — empty registry can't pick
    const idx = Math.floor(rng() * keys.length) % keys.length;
    _sessionMap = keys[idx]!;
  }
  return _sessionMap;
}

/** S140 — test-only escape hatch for the session memoisation. */
export function _resetSessionMap(): void {
  _sessionMap = undefined;
}
