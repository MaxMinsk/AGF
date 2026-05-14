import { expect, test } from "@playwright/test";

// Smoke-test the M15-a/b/c dev-server bridge end-to-end:
// open a real page (which triggers the page-bridge to WS), then have the
// test process fetch /__agf/* over HTTP and verify the page proxied the
// data back. This is exactly the flow an agent will use.

test("dev bridge round-trips snapshot, diagnostics, renderer-info, reload-events", async ({ page, baseURL }) => {
  expect(baseURL).toBeDefined();

  await page.goto("/?project=hello-3d");
  // Wait for the page bootstrap to complete so the WS handshake has run.
  await page.waitForFunction(() => Boolean((window as unknown as { __agf?: unknown }).__agf), {
    timeout: 5_000
  });
  // Give the WS round-trip a tick to settle (open + send hello + plugin sees us).
  await page.waitForTimeout(500);

  const fetchJson = async (path: string): Promise<{ status: number; body: { ok: boolean; payload?: unknown; error?: { code: string } } }> => {
    const url = new URL(path, baseURL).toString();
    const response = await fetch(url);
    const body = await response.json();
    return { status: response.status, body };
  };

  // Health reports the connected page now.
  const health = await fetchJson("/__agf/health");
  expect(health.status).toBe(200);
  expect(health.body).toMatchObject({ ok: true, page: { projectId: "hello-3d" } });

  // Snapshot must contain every entity declared in the hello-3d scene.
  const snapshot = await fetchJson("/__agf/snapshot");
  expect(snapshot.status).toBe(200);
  expect(snapshot.body.ok).toBe(true);
  const snap = snapshot.body.payload as { entities: Array<{ id: string }> };
  const ids = snap.entities.map((entity) => entity.id).sort();
  expect(ids).toEqual(
    [
      "arena.platform",
      "arena.root",
      "camera.main",
      "cube.hero",
      "floor",
      "satellite.beacon",
      "satellite.disc",
      "tower.base",
      "tower.crown",
      "tower.spire"
    ].sort()
  );

  // Diagnostics: zero errors after the hello-3d hierarchy boot.
  const diagnostics = await fetchJson("/__agf/diagnostics");
  expect(diagnostics.status).toBe(200);
  expect(diagnostics.body.ok).toBe(true);
  const diags = diagnostics.body.payload as ReadonlyArray<{ severity: string }>;
  expect(diags.filter((d) => d.severity === "error")).toEqual([]);

  // Renderer info: the keys exist and are non-negative numbers.
  const renderer = await fetchJson("/__agf/renderer-info");
  expect(renderer.status).toBe(200);
  const info = renderer.body.payload as Record<string, number>;
  for (const key of ["geometries", "textures", "programs", "drawCalls", "triangles", "meshes"]) {
    expect(typeof info[key]).toBe("number");
    expect(info[key]).toBeGreaterThanOrEqual(0);
  }

  // Reload events: starts empty after a fresh boot.
  const reload = await fetchJson("/__agf/reload-events");
  expect(reload.status).toBe(200);
  expect(reload.body.payload).toEqual([]);

  // Unknown routes return a structured 404 (verified earlier in unit tests
  // but worth one network-level check too).
  const missing = await fetchJson("/__agf/does-not-exist");
  expect(missing.status).toBe(404);
  expect(missing.body.error?.code).toBe("AGF_BRIDGE_ROUTE_UNKNOWN");

  // Bug report bundles snapshot + diagnostics + rendererInfo into one payload.
  const bug = await fetchJson("/__agf/bug-report");
  expect(bug.status).toBe(200);
  expect(bug.body.ok).toBe(true);
  const report = bug.body.payload as {
    agfFormatVersion: number;
    projectId: string;
    profile: string;
    capturedAt: string;
    snapshot: { entities: Array<{ id: string }> };
    diagnostics: ReadonlyArray<{ severity: string }>;
    rendererInfo: Record<string, number>;
    reloadEvents: ReadonlyArray<unknown>;
  };
  expect(report.agfFormatVersion).toBe(1);
  expect(report.projectId).toBe("hello-3d");
  expect(typeof report.capturedAt).toBe("string");
  expect(report.snapshot.entities.length).toBeGreaterThan(0);
  expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(typeof report.rendererInfo["meshes"]).toBe("number");
});
