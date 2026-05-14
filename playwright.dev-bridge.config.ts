import baseConfig from "./playwright.config";
import { defineConfig } from "@playwright/test";

// Dedicated config for tests/e2e/dev-bridge.spec.ts. The dev bridge only
// allows one connected page per server, so this spec must run alone (no
// parallel workers, no other specs sharing the dev server).

export default defineConfig({
  ...baseConfig,
  // Override the parent's testIgnore so this spec actually runs here.
  testIgnore: [],
  testMatch: ["**/dev-bridge.spec.ts"],
  fullyParallel: false,
  workers: 1
});
