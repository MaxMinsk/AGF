// Per-test failure capture for CI triage. Each `test` that uses this
// fixture set (via `test = base.extend(artifactsFixture)`) auto-attaches
// to its `testInfo`, on failure:
//   * full Playwright trace (already toggled by `trace: "retain-on-failure"` in config)
//   * the page screenshot (already attached by config)
//   * the browser console log captured across the test
//   * `__agf.diagnostics()` snapshot
//   * `__agf.rendererInfo()` snapshot
//   * `__agf.frameTiming()` snapshot
//
// Goal: on failure CI runs no longer need anyone to re-run the spec locally
// to ask "what was the snapshot when this timed out?" — the answer is in
// the artifacts.

import { test as base, type ConsoleMessage } from "@playwright/test";

type CapturedConsole = {
  type: ConsoleMessage["type"] extends () => infer R ? R : string;
  text: string;
};

type AgfSurface = {
  diagnostics?: () => unknown;
  rendererInfo?: () => unknown;
  frameTiming?: () => unknown;
};

export const test = base.extend<{
  capturedConsole: CapturedConsole[];
}>({
  // eslint-disable-next-line no-empty-pattern
  capturedConsole: async ({ page }, use, testInfo) => {
    const log: CapturedConsole[] = [];
    const onConsole = (msg: ConsoleMessage): void => {
      log.push({ type: msg.type() as CapturedConsole["type"], text: msg.text() });
    };
    page.on("console", onConsole);

    await use(log);

    if (testInfo.status === testInfo.expectedStatus) {
      page.off("console", onConsole);
      return;
    }

    await testInfo.attach("console", {
      body: JSON.stringify(log, null, 2),
      contentType: "application/json"
    });

    try {
      const agfState = await page.evaluate(() => {
        const api = (window as unknown as { __agf?: AgfSurface }).__agf;
        if (api === undefined) return null;
        return {
          diagnostics: api.diagnostics?.(),
          rendererInfo: api.rendererInfo?.(),
          frameTiming: api.frameTiming?.()
        };
      });
      if (agfState !== null) {
        await testInfo.attach("agf-state", {
          body: JSON.stringify(agfState, null, 2),
          contentType: "application/json"
        });
      }
    } catch (error) {
      await testInfo.attach("agf-state-error", {
        body: String(error),
        contentType: "text/plain"
      });
    }

    page.off("console", onConsole);
  }
});

export { expect } from "@playwright/test";
