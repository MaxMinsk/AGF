// S81 KABOOM-GENERATOR-FRAMEWORK CLI bridge. Loads a project-local
// generator module by name and runs it through `runGenerator`. Wired
// into `engine generate` via engine/tools/cli.ts.
//
// Lookup convention:
//   <projectDir>/generators/<template>.gen.mjs   (preferred — pure ESM, no tsx needed)
//   <projectDir>/generators/<template>.gen.ts    (loaded via tsx if installed)
//
// The module must default-export a `Generator` function.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runGenerator } from "./generate";
import type { Generator } from "./types";

export type RunGenerateCliOptions = {
  projectDir: string;
  template: string;
  seed: number;
  paramsJson: string | undefined;
  out: string | undefined;
};

export type RunGenerateCliResult = {
  ok: boolean;
  outPath: string | undefined;
  diagnostics: ReadonlyArray<{
    code: string;
    severity: "error" | "warning";
    message: string;
    path?: string;
  }>;
};

export async function runGenerateCli(options: RunGenerateCliOptions): Promise<RunGenerateCliResult> {
  const baseDir = resolve(options.projectDir, "generators");
  const mjsPath = resolve(baseDir, `${options.template}.gen.mjs`);
  const tsPath = resolve(baseDir, `${options.template}.gen.ts`);
  let modulePath: string | undefined;
  if (existsSync(mjsPath)) modulePath = mjsPath;
  else if (existsSync(tsPath)) modulePath = tsPath;
  if (modulePath === undefined) {
    return {
      ok: false,
      outPath: undefined,
      diagnostics: [
        {
          code: "AGF_GENERATOR_MODULE_NOT_FOUND",
          severity: "error",
          message: `Could not find generator "${options.template}" under ${baseDir}. Expected ${options.template}.gen.mjs or .gen.ts.`
        }
      ]
    };
  }

  // ESM dynamic import. .ts paths only work when the CLI was launched
  // through tsx (it is — package.json scripts call `tsx engine/tools/cli.ts`).
  const moduleUrl = pathToFileURL(modulePath).href;
  const module = (await import(moduleUrl)) as { default?: Generator };
  const generator = module.default;
  if (typeof generator !== "function") {
    return {
      ok: false,
      outPath: undefined,
      diagnostics: [
        {
          code: "AGF_GENERATOR_NO_DEFAULT_EXPORT",
          severity: "error",
          message: `Generator module ${modulePath} must default-export a Generator function.`
        }
      ]
    };
  }

  const params = options.paramsJson !== undefined ? (JSON.parse(options.paramsJson) as Record<string, unknown>) : {};
  const result = runGenerator({ seed: options.seed, generator, params });

  if (result.diagnostics.some((d) => d.severity === "error")) {
    return { ok: false, outPath: undefined, diagnostics: result.diagnostics };
  }

  const outPath = options.out !== undefined ? resolve(options.out) : undefined;
  if (outPath !== undefined) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(result.scene, null, 2) + "\n");
  } else {
    process.stdout.write(JSON.stringify(result.scene, null, 2) + "\n");
  }

  return { ok: true, outPath, diagnostics: result.diagnostics };
}
