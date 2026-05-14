// S45 AGENT-cli-screenshot.
//
// One-shot canvas capture via a headless Chromium driven by @playwright/test.
// Awaits `window.__agf.rendererReady` so the screenshot is deterministic
// (no first-frame-black flake). Output is a PNG written to the requested path.
//
// Intended use:
//   engine screenshot <projectId> --out test-results/<name>.png
//
// Notes:
//   - Boots a transient Vite dev server via `npm run dev` on a random
//     localhost port when one is not already running. Reuses an existing
//     server on the configured URL when present (--reuse-server).
//   - Stays headless. No interactive flow. No fixture state.
//   - This is a *thin wrapper* — no Playwright fixtures, no reporters.

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

export type ScreenshotOptions = {
  projectId: string;
  outPath: string;
  serverUrl?: string;
  /** When set, do not boot a dev server; reuse the one at serverUrl. */
  reuseServer?: boolean;
  /** Frame budget after rendererReady before capture (ms). Default 250. */
  settleMs?: number;
};

export type ScreenshotResult = {
  ok: boolean;
  projectId: string;
  outPath: string;
  serverUrl: string;
  durationMs: number;
  error: string | undefined;
};

function waitFor(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  return new Promise<void>((res, rej) => {
    const tick = (): void => {
      fetch(url)
        .then((response) => {
          if (response.ok) {
            res();
            return;
          }
          throw new Error(`status ${response.status}`);
        })
        .catch(() => {
          if (Date.now() - start > timeoutMs) {
            rej(new Error(`dev server at ${url} never responded`));
            return;
          }
          setTimeout(tick, 250);
        });
    };
    tick();
  });
}

async function spawnDevServer(): Promise<{
  url: string;
  child: ChildProcess;
}> {
  const port = 23000 + Math.floor(Math.random() * 4000);
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    "npx",
    ["vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env }
    }
  );
  await waitFor(url);
  return { url, child };
}

export async function captureProjectScreenshot(
  options: ScreenshotOptions
): Promise<ScreenshotResult> {
  const settleMs = options.settleMs ?? 250;
  const outPath = resolve(options.outPath);
  mkdirSync(dirname(outPath), { recursive: true });

  let serverUrl = options.serverUrl ?? "http://127.0.0.1:5173";
  let spawned: ChildProcess | undefined;
  const start = Date.now();
  let browser: Browser | undefined;

  try {
    if (options.reuseServer !== true) {
      try {
        await waitFor(serverUrl, 2_000);
      } catch {
        const result = await spawnDevServer();
        spawned = result.child;
        serverUrl = result.url;
      }
    }

    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page: Page = await context.newPage();
    await page.goto(`${serverUrl}/?project=${encodeURIComponent(options.projectId)}`);
    await page.waitForFunction(
      () =>
        Boolean(
          (window as unknown as { __agf?: { rendererReady?: Promise<unknown> } })
            .__agf?.rendererReady
        ),
      undefined,
      { timeout: 30_000 }
    );
    await page.evaluate(async () => {
      const surface = (window as unknown as {
        __agf?: { rendererReady?: Promise<unknown> };
      }).__agf;
      await surface?.rendererReady;
    });
    await page.waitForTimeout(settleMs);
    await page.screenshot({ path: outPath, fullPage: true });
    return {
      ok: true,
      projectId: options.projectId,
      outPath,
      serverUrl,
      durationMs: Date.now() - start,
      error: undefined
    };
  } catch (error) {
    return {
      ok: false,
      projectId: options.projectId,
      outPath,
      serverUrl,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await browser?.close();
    if (spawned !== undefined) {
      spawned.kill("SIGTERM");
    }
  }
}

export function formatScreenshotResult(result: ScreenshotResult): string {
  if (result.ok) {
    return `Screenshot saved: ${result.outPath}\n  project: ${result.projectId}\n  via: ${result.serverUrl}\n  duration: ${result.durationMs} ms`;
  }
  return `engine screenshot failed: ${result.error ?? "(unknown)"}\n  project: ${result.projectId}\n  via: ${result.serverUrl}`;
}

void existsSync; // keep the import in case future extensions need it.
