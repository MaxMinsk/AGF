import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Single retry for load-induced flakes (hmr-stress, multiclient-roundtrip,
  // score-pulse can lose a frame when the full suite runs in parallel
  // against the same dev server; each passes deterministically in isolation).
  // Real regressions still fail both attempts.
  retries: 1,
  // CI Linux runners are noticeably slower than local macOS — many beacon
  // gameplay specs hit the default 30 s test ceiling there even though they
  // pass locally in 5–10 s. 60 s gives the renderer + physics + Vite boot
  // chain enough headroom without masking real regressions; in isolation a
  // healthy test still completes well under that budget.
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    {
      // Default project: every spec except the ones explicitly routed into
      // `serial-heavy` below. Runs fully parallel against one shared dev
      // server, matching the historical layout.
      name: "chromium",
      testIgnore: [/hmr-stress\.spec\.ts/, /multiclient-roundtrip\.spec\.ts/],
      use: { ...devices["Desktop Chrome"] }
    },
    {
      // Heavyweight specs that either own a backend process or rewrite
      // tracked project files. They cannot share the dev server worker pool
      // safely — running them serial with a larger timeout and an extra
      // retry budget eliminates the historical S42-era flakiness without
      // bloating the rest of the suite.
      name: "serial-heavy",
      testMatch: [/hmr-stress\.spec\.ts/, /multiclient-roundtrip\.spec\.ts/],
      fullyParallel: false,
      retries: 2,
      timeout: 90_000,
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});

