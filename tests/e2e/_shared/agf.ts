// Shared Playwright helpers — the e2e specs converged on a small set of
// "wait for AGF to be in state X" patterns. Extracting them here ensures the
// CI timeout strategy is consistent across specs (see
// docs/research/e2e-ci-investigation.md for the Sprint 46 root-cause work).
//
// Hard rules:
//   * Helpers must NOT introduce hidden waits beyond what the helper name
//     suggests. If a test needs gameplay state to settle, it calls
//     `waitForAgfPredicate` with an explicit predicate.
//   * Timeouts default to 30s. This is much higher than the historical
//     inline `{ timeout: 5_000 }` but still well under Playwright's outer
//     `timeout: 60_000` so a real hang still fails fast.

import type { Page } from "@playwright/test";

export type AgfSnapshot = {
  entities: Array<{
    id: string;
    components: Record<string, unknown>;
  }>;
};

// Note: the global Window.__agf type is declared in src/global.d.ts. Here we
// only use it through structural lookups so we don't clash with the
// engine-side declaration. Helpers below treat the surface as a duck-typed
// record of optional callables.

/**
 * Wait until the AGF runtime has booted to a point safe for assertions:
 *
 *  1. `window.__agf` exists.
 *  2. `__agf.rendererReady` has resolved (first draw landed).
 *  3. The first scene-load command has applied (`snapshot().entities.length > 0`).
 *  4. `frameTiming().samples >= 1` (at least one full tick passed).
 *
 * The combined budget covers the slowest legit boot path observed on
 * ubuntu-latest (≈12s for Beacon's full scene + physics warm-up). Real
 * hangs still fail well inside the spec's outer 60s ceiling.
 */
export async function waitForAgfReady(
  page: Page,
  options: { timeout?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 30_000;
  await page.waitForFunction(
    () =>
      Boolean(
        (window as unknown as { __agf?: unknown }).__agf
      ),
    undefined,
    { timeout }
  );
  await page.evaluate(async () => {
    const api = (window as unknown as { __agf?: { rendererReady?: Promise<void> } }).__agf;
    await api?.rendererReady;
  });
  await page.waitForFunction(
    () => {
      const api = (window as unknown as { __agf?: { snapshot?: () => { entities: unknown[] } } }).__agf;
      const snap = api?.snapshot?.();
      return Boolean(snap && Array.isArray(snap.entities) && snap.entities.length > 0);
    },
    undefined,
    { timeout }
  );
  await page.waitForFunction(
    () => {
      const api = (window as unknown as { __agf?: { frameTiming?: () => { samples: number } } }).__agf;
      const ft = api?.frameTiming?.();
      return Boolean(ft && ft.samples >= 1);
    },
    undefined,
    { timeout }
  );
}

/**
 * Wait until `predicate(snapshot)` returns true. The predicate runs in the
 * page context; it receives the latest `__agf.snapshot()` each poll.
 * Defaults to 30s — the same envelope as `waitForAgfReady` so call-sites
 * don't need to think about CI-vs-local budget calibration.
 */
export async function waitForAgfPredicate(
  page: Page,
  predicate: (snapshot: AgfSnapshot) => boolean,
  options: { timeout?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 30_000;
  await page.waitForFunction(
    (fn) => {
      const api = (window as unknown as { __agf?: { snapshot?: () => unknown } }).__agf;
      const snap = api?.snapshot?.();
      if (snap === undefined) return false;
      // eslint-disable-next-line no-new-func
      const check = new Function("snap", `return (${fn})(snap);`);
      return Boolean(check(snap));
    },
    predicate.toString(),
    { timeout }
  );
}
