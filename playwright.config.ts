import { defineConfig, devices } from "@playwright/test";

// Three projects, three concerns:
//
//   * `smoke` — small reliable subset that MUST be green on every PR. Runs
//     against `vite preview` (production build). Fast cold-boot, no Vite
//     transform-on-request, no HMR. Required CI gate.
//
//   * `chromium-preview` — full suite against `vite preview`. The default
//     home for gameplay / rendering / playtest specs because they don't
//     need HMR. Nightly in CI, also runnable locally.
//
//   * `chromium` — full suite against `vite dev` (HMR enabled). Only HMR /
//     dev-bridge / hot-reload specs *need* this surface. Nightly in CI.
//
// `serial-heavy` (HMR-stress + multiclient) keeps its own profile inside
// the dev project because both specs spawn long-running side processes
// (file watchers, the Node backend) that fight the parallel pool.
//
// Sprint 46 OSS-e2e-preview-mode + OSS-e2e-required-smoke + OSS-e2e-full-nightly.
// See docs/research/e2e-ci-investigation.md for the root-cause analysis.

const SMOKE_TESTS = [
  /app\.spec\.ts/,
  /project-switcher\.spec\.ts/,
  /hello-3d-hierarchy\.spec\.ts/,
  /dev-bridge\.spec\.ts/,
  /playtest-runner\.spec\.ts/
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
  // CI Linux runners are noticeably slower than local macOS. 60s gives the
  // renderer + physics + Vite boot chain headroom without masking real
  // regressions. Locally healthy tests still finish well under that budget.
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
      // Required-on-every-PR smoke. Runs against the same dev server as
      // the rest of the matrix today (preview-mode lands as a separate
      // workflow toggle in this same sprint).
      name: "smoke",
      testMatch: SMOKE_TESTS,
      testIgnore: SERIAL_HEAVY_TESTS,
      use: { ...devices["Desktop Chrome"] }
    },
    {
      // Full dev-server matrix for nightly. Excludes smoke (already
      // covered) + serial-heavy (own project below).
      name: "chromium",
      testIgnore: [...SMOKE_TESTS, ...SERIAL_HEAVY_TESTS],
      use: { ...devices["Desktop Chrome"] }
    },
    {
      // Production-bundle matrix. Same gameplay + rendering specs, no
      // HMR / dev-bridge / Vite transform-on-request. Use this to catch
      // build-time regressions and to confirm CI flakes are dev-server-
      // related, not gameplay regressions.
      //
      // Toggled by `PREVIEW=1 npm run test:e2e` (see scripts/run-e2e-preview.mjs).
      name: "chromium-preview",
      testIgnore: [...HMR_AND_DEV_BRIDGE_TESTS, ...SERIAL_HEAVY_TESTS],
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "serial-heavy",
      testMatch: SERIAL_HEAVY_TESTS,
      fullyParallel: false,
      retries: 2,
      timeout: 120_000,
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
