// S83 AGF-LOG-BOOT-NOISE-BUDGET.
//
// Catches regressions where someone slips a per-frame log into a
// startup path. Asserts that booting hello-3d (the smallest project)
// emits:
//   - ZERO error-severity diagnostics
//   - ZERO warning-severity diagnostics
//   - ≤ 20 info-severity diagnostics through first idle
//
// The info budget is intentionally lax for now (lifecycle traces +
// scheduler register events from S83 alone push 8-12 events). When
// the floor settles we can tighten the cap. The hard constraint is
// the zero-tolerance for warning / error during a clean boot.

import { test, expect } from "@playwright/test";

const INFO_BUDGET = 20;

test("@boot-noise-budget hello-3d emits no warning/error and stays under the info budget", async ({ page, baseURL }) => {
  test.setTimeout(45_000);
  await page.goto(new URL("/?project=hello-3d", baseURL ?? "http://localhost:5173").toString(), {
    waitUntil: "networkidle"
  });
  // Reach into the runtime diagnostics buffer through the existing
  // dev-bridge endpoint — the page exposes it via the global __agf,
  // but the endpoint is the contract surface other agents grep for.
  const diagnostics = await page.evaluate(async (): Promise<Array<{ severity: string; code: string }>> => {
    const r = await fetch("/__agf/diagnostics");
    const j = (await r.json()) as { payload?: { snapshot?: Array<{ severity: string; code: string }> } };
    return j.payload?.snapshot ?? [];
  });
  const counts = diagnostics.reduce<Record<string, number>>((acc, d) => {
    acc[d.severity] = (acc[d.severity] ?? 0) + 1;
    return acc;
  }, {});
  // eslint-disable-next-line no-console
  console.log(
    `[boot-noise-budget] info=${counts["info"] ?? 0} warning=${counts["warning"] ?? 0} error=${counts["error"] ?? 0} debug=${counts["debug"] ?? 0} trace=${counts["trace"] ?? 0}`
  );

  expect(counts["error"] ?? 0).toBe(0);
  expect(counts["warning"] ?? 0).toBe(0);
  expect(counts["info"] ?? 0).toBeLessThanOrEqual(INFO_BUDGET);
});
