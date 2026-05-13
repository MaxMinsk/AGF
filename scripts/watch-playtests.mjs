// Watch examples/*/playtests/*.playtest.json and re-run the matching Playwright
// scenario whenever a file changes. Long-running; Ctrl-C to stop.
//
// Re-uses any dev server already running on 5173 (Playwright config has
// reuseExistingServer: true) so this script does not need to manage Vite.
//
// Spawns one `npx playwright test ... --grep <scenarioId>` per change. Stale
// processes are not killed — Playwright runs are short and the agent typically
// edits one scenario at a time.

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { watch } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const examplesDir = resolve(repoRoot, "examples");
const runnerSpecPath = "tests/e2e/playtest-runner.spec.ts";

if (!existsSync(examplesDir)) {
  console.error(`[agf] examples directory not found: ${examplesDir}`);
  process.exit(1);
}

console.log("[agf] watching examples/*/playtests/*.playtest.json — Ctrl-C to stop.");

const watcher = watch(examplesDir, { recursive: true });

for await (const event of watcher) {
  const filename = event.filename;
  if (filename === null || filename === undefined) {
    continue;
  }
  if (!filename.endsWith(".playtest.json")) {
    continue;
  }
  const normalised = filename.split(sep).join("/");
  if (!normalised.includes("/playtests/")) {
    continue;
  }

  const filePath = resolve(examplesDir, filename);
  if (!existsSync(filePath)) {
    continue;
  }

  let scenario;
  try {
    scenario = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`[agf] ${filename}: JSON parse failed — ${error.message}`);
    continue;
  }
  if (typeof scenario?.id !== "string" || scenario.id.length === 0) {
    console.error(`[agf] ${filename}: scenario.id missing — skipping`);
    continue;
  }

  console.log(`\n[agf] re-running playtest: ${scenario.id} (${filename})`);
  const child = spawn(
    "npx",
    ["playwright", "test", runnerSpecPath, "--grep", scenario.id],
    { stdio: "inherit", cwd: repoRoot }
  );
  child.on("exit", (code) => {
    console.log(`[agf] playtest "${scenario.id}" exited with code ${code}`);
  });
}
