// Playwright config used when running against the production build via
// `vite preview`. Same projects + timeouts as `playwright.config.ts` but
// the dev `webServer` boot is replaced by `vite preview`. Designed to be
// invoked from CI's nightly e2e workflow + the local
// `npm run test:e2e:preview` script.
//
// We intentionally do NOT change baseURL — `vite preview` defaults to port
// 4173, which is different from dev's 5173. Reusing 5173 would collide
// with a running dev server.

import { defineConfig, devices } from "@playwright/test";

const SMOKE_TESTS = [
  /app\.spec\.ts/,
  /project-switcher\.spec\.ts/,
  /hello-3d-hierarchy\.spec\.ts/
];

const HMR_AND_DEV_BRIDGE_TESTS = [
  /hmr-stress\.spec\.ts/,
  /multiclient-roundtrip\.spec\.ts/,
  /material-hmr-audit\.spec\.ts/,
  /hazard-material-hmr\.spec\.ts/,
  /glb-hot-reload\.spec\.ts/,
  /dev-bridge\.spec\.ts/,
  /dev-tuner\.spec\.ts/
];

const SERIAL_HEAVY_TESTS = [/hmr-stress\.spec\.ts/, /multiclient-roundtrip\.spec\.ts/];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    // Build first (cheap incremental if dist/ exists), then serve.
    command: "npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 240_000
  },
  projects: [
    {
      name: "smoke-preview",
      testMatch: SMOKE_TESTS,
      testIgnore: [...HMR_AND_DEV_BRIDGE_TESTS, ...SERIAL_HEAVY_TESTS],
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "chromium-preview",
      testIgnore: [...HMR_AND_DEV_BRIDGE_TESTS, ...SERIAL_HEAVY_TESTS],
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
