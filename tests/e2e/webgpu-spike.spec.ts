// S61 WEBGPU-e2e-smoke. Boots `?project=webgpu-spike` end-to-end.
// Skips gracefully when chromium's WebGPU adapter is unavailable
// (headless on Linux CI, fingerprint-blocked browsers, etc.) so the
// smoke job stays green; runs the actual assertions when WebGPU is
// reachable (developer machines, mac chromium with the flag).

import { test, expect } from "@playwright/test";

test("[webgpu-spike] WebGPU adapter renders the spike project end-to-end", async ({ page }) => {
  // Probe for navigator.gpu without booting the runtime first. If
  // WebGPU is unavailable (no GPUAdapter), skip — the user can re-run
  // locally with `--enable-unsafe-webgpu` if their chromium version
  // gates WebGPU behind that flag.
  await page.goto("about:blank");
  const webgpuAvailable = await page.evaluate(async () => {
    if ((navigator as unknown as { gpu?: unknown }).gpu === undefined) return false;
    try {
      const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter();
      return adapter !== null && adapter !== undefined;
    } catch {
      return false;
    }
  });
  test.skip(!webgpuAvailable, "navigator.gpu unavailable in this chromium build — skipping WebGPU smoke. Run locally to exercise.");

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("404")) {
      pageErrors.push(`console.error: ${msg.text()}`);
    }
  });

  await page.goto("/?project=webgpu-spike", { waitUntil: "domcontentloaded" });
  // Wait for adapter.init() + first frame. Generous timeout because
  // WebGPU device acquisition is async + may negotiate a fallback.
  await page.waitForFunction(
    () => (window as unknown as { __agf?: { rendererInfo(): { meshes: number } } }).__agf?.rendererInfo().meshes !== undefined &&
          (window as unknown as { __agf: { rendererInfo(): { meshes: number } } }).__agf.rendererInfo().meshes > 0,
    { timeout: 30000 }
  );

  const info = await page.evaluate(() => {
    const api = (window as unknown as {
      __agf: { rendererInfo(): { renderer: "webgl" | "webgpu"; meshes: number; lights: number; shadowCasters: number } };
    }).__agf;
    return api.rendererInfo();
  });
  expect(info.renderer).toBe("webgpu");
  // Hello-3d-shaped scene: 4 meshes (cube + sphere + cylinder + floor),
  // 2 lights (sun + hemi), 1 shadow caster (sun).
  expect(info.meshes).toBeGreaterThanOrEqual(4);
  expect(info.lights).toBeGreaterThanOrEqual(2);
  expect(info.shadowCasters).toBeGreaterThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});
