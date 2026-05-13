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

describe("engine CLI", () => {
  it("exits with 0 for a valid project", async () => {
    const result = await runCli(["check", resolve(fixturesRoot, "valid-project"), "--json"]);
    const payload = JSON.parse(result.stdout) as { ok: boolean; diagnostics: unknown[] };

    expect(result.code).toBe(0);
    expect(payload.ok).toBe(true);
    expect(payload.diagnostics).toEqual([]);
  });

  it("exits with 1 for an invalid project", async () => {
    const result = await runCli(["check", resolve(fixturesRoot, "invalid-project"), "--json"]);
    const payload = JSON.parse(result.stdout) as { ok: boolean; diagnostics: Array<{ code: string }> };

    expect(result.code).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "AGF_SCHEMA_UNKNOWN_PROPERTY")).toBe(true);
  });
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
