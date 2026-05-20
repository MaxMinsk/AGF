import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type CliResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxBin = resolve(repositoryRoot, "node_modules/.bin/tsx");
const cliPath = resolve(repositoryRoot, "engine/tools/cli.ts");
const fixturesRoot = resolve(repositoryRoot, "tests/fixtures");

// S98 BUG-ENGINE-CLI-INSPECT-SUMMARY-FLAKE — each `it()` here spawns a
// fresh `tsx engine/tools/cli.ts` process. Cold-start of tsx + the
// full CLI dep graph reliably blows the 5000 ms vitest default on
// slower CI workers. Override per-test to 15000 ms.
const CLI_TEST_TIMEOUT_MS = 15000;

describe("engine CLI", () => {
  it("exits with 0 for a valid project", async () => {
    const result = await runCli(["check", resolve(fixturesRoot, "valid-project"), "--json"]);
    const payload = JSON.parse(result.stdout) as { ok: boolean; diagnostics: unknown[] };

    expect(result.code).toBe(0);
    expect(payload.ok).toBe(true);
    expect(payload.diagnostics).toEqual([]);
  }, CLI_TEST_TIMEOUT_MS);

  it("exits with 1 for an invalid project", async () => {
    const result = await runCli(["check", resolve(fixturesRoot, "invalid-project"), "--json"]);
    const payload = JSON.parse(result.stdout) as { ok: boolean; diagnostics: Array<{ code: string }> };

    expect(result.code).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "AGF_SCHEMA_UNKNOWN_COMPONENT")).toBe(true);
  }, CLI_TEST_TIMEOUT_MS);

  it("prints inspect JSON for a valid project", async () => {
    const result = await runCli(["inspect", resolve(fixturesRoot, "valid-project"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      scene?: { entityCount: number; entities: Array<{ id: string; componentNames: string[] }> };
    };

    expect(result.code).toBe(0);
    expect(payload.ok).toBe(true);
    expect(payload.scene?.entityCount).toBe(2);
    expect(payload.scene?.entities[0]).toEqual(
      expect.objectContaining({
        id: "camera.main",
        componentNames: ["Camera", "Transform"]
      })
    );
  }, CLI_TEST_TIMEOUT_MS);

  it("prints a stable inspect summary", async () => {
    const result = await runCli(["inspect", resolve(fixturesRoot, "valid-project")]);

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatchInlineSnapshot(`
      "Project: Valid Project (valid-project)
      Start scene: scenes/start.scene.json
      Scene: start
      Entities: 2
      - camera.main: Camera, Transform
      - cube: MeshRenderer, Name, Transform"
    `);
  }, CLI_TEST_TIMEOUT_MS);

  // S98 REGRESSION-ENGINE-CLI-INSPECT-SUMMARY — locks the flake fix.
  // The original test ran a single inspect and blew the 5000 ms default
  // on slower workers; if a future change re-introduces cold-start
  // bloat (heavy top-level imports in cli.ts, etc.) this 3x serial run
  // will trip the per-test timeout long before CI does.
  it("S98 regression: 3x warm inspect runs finish under 10s each", async () => {
    for (let i = 0; i < 3; i += 1) {
      const t0 = Date.now();
      const result = await runCli(["inspect", resolve(fixturesRoot, "valid-project")]);
      const elapsedMs = Date.now() - t0;
      expect(result.code).toBe(0);
      expect(elapsedMs).toBeLessThan(10000);
    }
  }, CLI_TEST_TIMEOUT_MS * 3);
});

function runCli(args: string[]): Promise<CliResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(tsxBin, [cliPath, ...args], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ code, stdout, stderr });
    });
  });
}
