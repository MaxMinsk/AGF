// agf-allow:console-file `engine` CLI tools write terminal output through
// console.log / console.error by design. See docs/diagnostics-policy.md
// §2 — `console.*` is allowed in scripts + CLI surfaces where the
// runtime diagnostics bus is unavailable (no in-process world).
import { spawn } from "node:child_process";
import {
  writeFileSync,
  mkdirSync,
  watch as fsWatch,
  existsSync as existsSyncCli,
  readdirSync as readdirSyncCli
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath as fileURLToPathCli } from "node:url";

const repoRootFromCli = resolve(dirname(fileURLToPathCli(import.meta.url)), "../..");

type NewProjectOptionsForCli = {
  name: string;
  templateId?: string;
  targetDir?: string;
};
import { checkProject, formatDiagnostics } from "./check/project-check";
import {
  formatInspection,
  inspectProject,
  NOISY_METADATA_COMPONENTS,
  tailInspectResult,
  toStableInspectResult,
  type InspectOptions
} from "./inspect/project-inspect";
import {
  diffSnapshots,
  formatDiff,
  readInspectSnapshot,
  tailSnapshotDiff,
  type SnapshotDiffResult
} from "./inspect/snapshot-diff";
import { formatSummary, summarizeProject } from "./summarize/project-summarize";
import { applyMigration, formatPlan, planMigration } from "./migrate/project-migrate";
import { formatDoctor, runDoctor } from "./doctor/project-doctor";
import { importAsset } from "./asset/asset-import";
import { formatReplay, replay } from "./replay/project-replay";
import { formatDocsResult, generateDocs } from "./docs/project-docs";
import { applyPatch, formatPatchResult, type EnginePatch } from "./patch/project-patch";
import {
  formatComponentCatalog,
  listComponentCatalog
} from "./components/list-components";
import {
  explainComponent,
  formatComponentExplanation
} from "./components/explain-component";
import { createProjectFromTemplate, formatNewProjectResult } from "./new/project-new";
// engine screenshot is loaded lazily so the engine: CLI surface doesn't drag
// playwright into every command's startup cost.
import { readFileSync } from "node:fs";

type ParsedArgs = {
  command: string | undefined;
  projectDir: string;
  json: boolean;
  components: string[];
  entityIds: string[];
  diffPaths: [string, string] | undefined;
  savePath: string | undefined;
  tail: number | undefined;
  excludeComponents: string[];
  componentsOnly: boolean;
  watch: boolean;
  onChange: string | undefined;
  dryRun: boolean;
  assetId: string | undefined;
  assetKind: string | undefined;
  assetLicense: string | undefined;
  assetNotes: string | undefined;
  assetSubdir: string | undefined;
  /** S54: --source <path> for `engine asset optimize` per-file mode. */
  assetSource: string | undefined;
  /** S54: --textures for `engine asset optimize` to include WebP texture compression. */
  assetTextures: boolean;
  expectPath: string | undefined;
  write: boolean;
  build: boolean;
  /** S83 AGF-LOG-DOCTOR-DIAGNOSTICS — optional path to a runtime diagnostics snapshot JSON. */
  diagnosticsFrom?: string;
  /** S81 KABOOM-GENERATOR-FRAMEWORK. */
  seed: number | undefined;
  template: string | undefined;
  outPath: string | undefined;
  paramsJson: string | undefined;
  positional: string[];
};

const parsedArgs = parseArgs(process.argv.slice(2));

if (parsedArgs.command === "check") {
  const result = checkProject(parsedArgs.projectDir);
  emitResult(result, parsedArgs, () => formatDiagnostics(result));
  process.exitCode = result.ok ? 0 : 1;
} else if (parsedArgs.command === "inspect") {
  if (parsedArgs.diffPaths !== undefined) {
    const [previousPath, nextPath] = parsedArgs.diffPaths;
    const previous = readInspectSnapshot(previousPath);
    const next = readInspectSnapshot(nextPath);
    const changes = diffSnapshots(previous, next);
    const full: SnapshotDiffResult = {
      ok: true,
      previousPath,
      nextPath,
      changeCount: changes.length,
      changes
    };
    const result = tailSnapshotDiff(full, { tail: parsedArgs.tail });
    emitResult(result, parsedArgs, () => formatDiff(result));
    process.exitCode = 0;
  } else if (parsedArgs.watch) {
    runInspectWatch(parsedArgs);
  } else {
    process.exitCode = runInspectOnce(parsedArgs);
  }
} else if (parsedArgs.command === "summarize") {
  const summary = summarizeProject(parsedArgs.projectDir);
  emitResult(summary, parsedArgs, () => formatSummary(summary));
  process.exitCode = 0;
} else if (parsedArgs.command === "migrate") {
  const plan = planMigration(parsedArgs.projectDir);
  emitResult(plan, parsedArgs, () => formatPlan(plan));
  if (!parsedArgs.dryRun) {
    applyMigration(plan);
    if (plan.patches.length > 0) {
      console.error(`Applied ${plan.patches.length} patch(es) to ${plan.projectDir}/project.json`);
    }
  }
  process.exitCode = 0;
} else if (parsedArgs.command === "doctor") {
  const report = runDoctor(parsedArgs.projectDir, undefined, {
    build: parsedArgs.build,
    ...(parsedArgs.diagnosticsFrom !== undefined ? { diagnosticsFrom: parsedArgs.diagnosticsFrom } : {})
  });
  emitResult(report, parsedArgs, () => formatDoctor(report));
  process.exitCode = report.ok ? 0 : 1;
} else if (parsedArgs.command === "docs") {
  const result = generateDocs({ projectDir: parsedArgs.projectDir });
  emitResult(result, parsedArgs, () => formatDocsResult(result));
  process.exitCode = 0;
} else if (parsedArgs.command === "patch") {
  const patchPath = parsedArgs.positional[2];
  if (patchPath === undefined) {
    console.error("Usage: engine patch <projectDir> <patch.json> [--check|--write] [--json] [--save <path>]");
    process.exitCode = 2;
  } else {
    const patch = JSON.parse(readFileSync(patchPath, "utf8")) as EnginePatch;
    const result = applyPatch(parsedArgs.projectDir, patch, {
      write: parsedArgs.write,
      validateAfter: true
    });
    emitResult(result, parsedArgs, () => formatPatchResult(result));
    process.exitCode = result.ok ? 0 : 1;
  }
} else if (parsedArgs.command === "generate") {
  // S81 KABOOM-GENERATOR-FRAMEWORK.
  const { runGenerateCli } = await import("./generators/cli");
  if (parsedArgs.template === undefined) {
    console.error("Usage: engine generate <projectDir> --template <name> --seed <int> [--params '<json>'] [--out <path>] [--json]");
    process.exitCode = 2;
  } else {
    const seed = parsedArgs.seed ?? 1;
    const result = await runGenerateCli({
      projectDir: parsedArgs.projectDir,
      template: parsedArgs.template,
      seed,
      paramsJson: parsedArgs.paramsJson,
      out: parsedArgs.outPath
    });
    if (parsedArgs.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      for (const d of result.diagnostics) {
        console.error(`${d.severity.toUpperCase()} ${d.code}${d.path !== undefined ? " " + d.path : ""}: ${d.message}`);
      }
      if (result.outPath !== undefined) {
        console.error(`[engine generate] wrote ${result.outPath}`);
      }
    }
    process.exitCode = result.ok ? 0 : 1;
  }
} else if (parsedArgs.command === "replay") {
  const positional = parsedArgs.positional;
  const recordingPath = positional[1] ?? positional[0];
  if (recordingPath === undefined || recordingPath === ".") {
    console.error("Usage: engine replay <recording.json> [--expect <snapshot.json>] [--json] [--save <path>]");
    process.exitCode = 2;
  } else {
    const result = replay(recordingPath, parsedArgs.expectPath);
    emitResult(result, parsedArgs, () => formatReplay(result));
    process.exitCode = result.drift !== undefined ? 1 : 0;
  }
} else if (parsedArgs.command === "asset") {
  const positional = parsedArgs.positional;
  const sub = positional[0];
  if (sub === "import") {
    const projectDir = positional[1];
    const sourceFile = positional[2];
    if (projectDir === undefined || sourceFile === undefined || parsedArgs.assetId === undefined) {
      console.error(
        "Usage: engine asset import <projectDir> <sourceFile> --id <id> [--kind ...] [--license ...] [--notes ...] [--subdir ...]"
      );
      process.exitCode = 2;
    } else {
      const importOptions: Parameters<typeof importAsset>[0] = {
        projectDir,
        sourceFile,
        id: parsedArgs.assetId
      };
      if (parsedArgs.assetKind !== undefined) importOptions.kind = parsedArgs.assetKind;
      if (parsedArgs.assetLicense !== undefined) importOptions.license = parsedArgs.assetLicense;
      if (parsedArgs.assetNotes !== undefined) importOptions.notes = parsedArgs.assetNotes;
      if (parsedArgs.assetSubdir !== undefined) importOptions.subdir = parsedArgs.assetSubdir;
      const result = importAsset(importOptions);
      emitResult(result, parsedArgs, () =>
        [
          `Imported ${result.runtimeRef}`,
          `  copied to: ${result.runtimePath}`,
          `  registered in: ${result.sourcesPath}`
        ].join("\n")
      );
      process.exitCode = 0;
    }
  } else if (sub === "optimize") {
    const projectDir = positional[1];
    if (projectDir === undefined) {
      console.error(
        "Usage: engine asset optimize <projectDir> [--source <path>] [--textures]"
      );
      process.exitCode = 2;
    } else {
      void (async (): Promise<void> => {
        const { optimizeProjectAssets, formatAssetOptimizeReport } = await import(
          "./asset/asset-optimize.js"
        );
        const optOptions: Parameters<typeof optimizeProjectAssets>[1] = {};
        if (parsedArgs.assetSource !== undefined) optOptions.source = parsedArgs.assetSource;
        if (parsedArgs.assetTextures) optOptions.textures = true;
        const report = await optimizeProjectAssets(projectDir, optOptions);
        emitResult(report, parsedArgs, () => formatAssetOptimizeReport(report));
        process.exitCode = 0;
      })();
    }
  } else {
    console.error(
      "Usage: engine asset <import|optimize> <projectDir> [...args]"
    );
    process.exitCode = 2;
  }
} else if (parsedArgs.command === "screenshot") {
  const positional = parsedArgs.positional;
  const projectId = positional[0];
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const serverIdx = args.indexOf("--server-url");
  const reuseServer = args.includes("--reuse-server");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
  const serverUrl = serverIdx >= 0 ? args[serverIdx + 1] : undefined;
  if (projectId === undefined || outPath === undefined) {
    console.error(
      "Usage: engine screenshot <projectId> --out <path.png> [--server-url <url>] [--reuse-server] [--json] [--save <path>]"
    );
    process.exitCode = 2;
  } else {
    void (async (): Promise<void> => {
      const { captureProjectScreenshot, formatScreenshotResult } = await import(
        "./screenshot/project-screenshot.js"
      );
      const opts: { projectId: string; outPath: string; serverUrl?: string; reuseServer?: boolean } = {
        projectId,
        outPath
      };
      if (serverUrl !== undefined) opts.serverUrl = serverUrl;
      if (reuseServer) opts.reuseServer = true;
      const result = await captureProjectScreenshot(opts);
      emitResult(result, parsedArgs, () => formatScreenshotResult(result));
      process.exitCode = result.ok ? 0 : 1;
    })();
  }
} else if (parsedArgs.command === "new") {
  const positional = parsedArgs.positional;
  const name = positional[0];
  if (name === undefined) {
    console.error("Usage: engine new <projectName> [--template <templateId>] [--target <dir>] [--json] [--save <path>]");
    process.exitCode = 2;
  } else {
    const args = process.argv.slice(2);
    const templateIdx = args.indexOf("--template");
    const targetIdx = args.indexOf("--target");
    const templateId = templateIdx >= 0 ? args[templateIdx + 1] : undefined;
    const targetDir = targetIdx >= 0 ? args[targetIdx + 1] : undefined;
    const opts: NewProjectOptionsForCli = { name };
    if (templateId !== undefined) opts.templateId = templateId;
    if (targetDir !== undefined) opts.targetDir = targetDir;
    const result = createProjectFromTemplate(opts);
    emitResult(result, parsedArgs, () => formatNewProjectResult(result));
    process.exitCode = result.ok ? 0 : 1;
  }
} else if (parsedArgs.command === "list") {
  const positional = parsedArgs.positional;
  const what = positional[0];
  if (what === "components") {
    const projectArg = positional[1];
    const catalog = listComponentCatalog(projectArg);
    emitResult(catalog, parsedArgs, () => formatComponentCatalog(catalog));
    process.exitCode = 0;
  } else if (what === "examples") {
    const examples = listExampleProjects();
    emitResult({ examples }, parsedArgs, () =>
      ["Examples:", ...examples.map((e) => `  ${e.id.padEnd(16)}  ${e.summary}`)].join("\n")
    );
    process.exitCode = 0;
  } else {
    console.error("Usage: engine list <components|examples> [projectDir]");
    process.exitCode = 2;
  }
} else if (parsedArgs.command === "explain") {
  const positional = parsedArgs.positional;
  const what = positional[0];
  const componentName = positional[1];
  if (what === "component" && componentName !== undefined) {
    const projectArg = positional[2];
    const explanation = explainComponent(componentName, projectArg);
    if (explanation === undefined) {
      console.error(`Unknown component "${componentName}". Run \`engine list components\` to see the catalog.`);
      process.exitCode = 1;
    } else {
      emitResult(explanation, parsedArgs, () => formatComponentExplanation(explanation));
      process.exitCode = 0;
    }
  } else {
    console.error("Usage: engine explain component <ComponentName> [projectDir]");
    process.exitCode = 2;
  }
} else {
  printUsage();
  process.exitCode = 2;
}

function listExampleProjects(): Array<{ id: string; summary: string }> {
  const examplesRoot = resolve(repoRootFromCli, "examples");
  if (!existsSyncCli(examplesRoot)) return [];
  const out: Array<{ id: string; summary: string }> = [];
  for (const entry of readdirSyncCli(examplesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "backends") continue;
    const projectPath = resolve(examplesRoot, entry.name, "project.json");
    if (!existsSyncCli(projectPath)) continue;
    const project = JSON.parse(readFileSync(projectPath, "utf8")) as { id?: string; name?: string };
    const id = project.id ?? entry.name;
    const summary = project.name ?? "";
    out.push({ id, summary });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function buildInspectOptions(args: ParsedArgs): InspectOptions {
  const options: InspectOptions = {};
  if (args.components.length > 0) {
    options.components = args.components;
  }
  if (args.entityIds.length > 0) {
    options.entityIds = args.entityIds;
  }
  const exclude = new Set<string>(args.excludeComponents);
  if (args.componentsOnly) {
    for (const name of NOISY_METADATA_COMPONENTS) {
      exclude.add(name);
    }
  }
  if (exclude.size > 0) {
    options.excludeComponents = [...exclude];
  }
  return options;
}

function runInspectOnce(args: ParsedArgs): number {
  const options = buildInspectOptions(args);
  const result = inspectProject(args.projectDir, options);
  const trimmed = tailInspectResult(result, args.tail);
  const persisted = args.savePath !== undefined ? toStableInspectResult(trimmed) : trimmed;
  emitResult(persisted, args, () => formatInspection(trimmed));
  return result.ok ? 0 : 1;
}

function runOnChange(command: string): void {
  console.error(`[engine inspect --watch] on-change: ${command}`);
  const child = spawn(command, [], { shell: true, stdio: "inherit" });
  child.on("error", (error) => {
    console.error(`[engine inspect --watch] on-change failed to start: ${error.message ?? error}`);
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[engine inspect --watch] on-change exited with code ${code}`);
    } else if (signal !== null) {
      console.error(`[engine inspect --watch] on-change killed by signal ${signal}`);
    }
  });
}

function runInspectWatch(args: ParsedArgs): void {
  const projectDir = resolve(args.projectDir);
  console.error(`[engine inspect --watch] watching ${projectDir} (Ctrl-C to stop)`);

  let pending: ReturnType<typeof setTimeout> | undefined;
  let runningSerial = 0;

  const trigger = (label: string): void => {
    if (pending !== undefined) {
      clearTimeout(pending);
    }
    pending = setTimeout(() => {
      pending = undefined;
      runningSerial += 1;
      const tag = new Date().toISOString().replace("T", " ").replace("Z", "");
      console.error(`[engine inspect --watch] ${tag} (#${runningSerial}, ${label})`);
      try {
        runInspectOnce(args);
      } catch (error) {
        console.error(`[engine inspect --watch] failed: ${(error as Error).message ?? error}`);
      }
      if (args.onChange !== undefined && args.onChange.length > 0) {
        runOnChange(args.onChange);
      }
    }, 120);
  };

  trigger("initial");

  let watcher: ReturnType<typeof fsWatch> | undefined;
  try {
    watcher = fsWatch(projectDir, { recursive: true }, (_eventType, filename) => {
      if (typeof filename !== "string") {
        return;
      }
      if (filename.endsWith(".json")) {
        trigger(filename);
      }
    });
  } catch (error) {
    console.error(
      `[engine inspect --watch] could not start watcher: ${(error as Error).message ?? error}`
    );
    process.exitCode = 1;
    return;
  }

  const shutdown = (): void => {
    if (pending !== undefined) {
      clearTimeout(pending);
      pending = undefined;
    }
    watcher?.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function emitResult(payload: unknown, args: ParsedArgs, formatHuman: () => string): void {
  if (args.savePath !== undefined) {
    const absolute = resolve(args.savePath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, JSON.stringify(payload, null, 2));
    console.error(`Saved snapshot to ${absolute}`);
    return;
  }
  if (args.json) {
    // Under --watch + --json, emit a single line per refresh so consumers can
    // parse the stream with line-delimited JSON parsers (NDJSON / JSON Lines).
    // Without --watch, keep the pretty-printed shape that one-shot callers
    // already rely on.
    const serialised = args.watch
      ? JSON.stringify(payload)
      : JSON.stringify(payload, null, 2);
    console.log(serialised);
  } else {
    console.log(formatHuman());
  }
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: args[0],
    projectDir: ".",
    json: false,
    components: [],
    entityIds: [],
    diffPaths: undefined,
    savePath: undefined,
    tail: undefined,
    excludeComponents: [],
    componentsOnly: false,
    watch: false,
    onChange: undefined,
    dryRun: false,
    assetId: undefined,
    assetKind: undefined,
    assetLicense: undefined,
    assetNotes: undefined,
    assetSubdir: undefined,
    assetSource: undefined,
    assetTextures: false,
    expectPath: undefined,
    write: false,
    build: false,
    seed: undefined,
    template: undefined,
    outPath: undefined,
    paramsJson: undefined,
    positional: []
  };

  for (let index = 1; index < args.length; index += 1) {
    const current = args[index];
    if (current === undefined) {
      continue;
    }
    if (current === "--json") {
      result.json = true;
      continue;
    }
    if (current === "--component") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        result.components.push(value);
      }
      continue;
    }
    if (current === "--query") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        for (const piece of value.split(",")) {
          const trimmed = piece.trim();
          if (trimmed.length > 0) {
            result.components.push(trimmed);
          }
        }
      }
      continue;
    }
    if (current === "--entity") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        result.entityIds.push(value);
      }
      continue;
    }
    if (current === "--diff") {
      const a = args[++index];
      const b = args[++index];
      if (a !== undefined && b !== undefined) {
        result.diffPaths = [a, b];
      }
      continue;
    }
    if (current === "--save") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        result.savePath = value;
      }
      continue;
    }
    if (current === "--tail") {
      const value = args[++index];
      if (value !== undefined) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          result.tail = parsed;
        }
      }
      continue;
    }
    if (current === "--exclude-component") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        for (const piece of value.split(",")) {
          const trimmed = piece.trim();
          if (trimmed.length > 0) {
            result.excludeComponents.push(trimmed);
          }
        }
      }
      continue;
    }
    if (current === "--components-only") {
      result.componentsOnly = true;
      continue;
    }
    if (current === "--watch") {
      result.watch = true;
      continue;
    }
    if (current === "--on-change") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        result.onChange = value;
      }
      continue;
    }
    if (current === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (current === "--id") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        result.assetId = value;
      }
      continue;
    }
    if (current === "--kind") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        result.assetKind = value;
      }
      continue;
    }
    if (current === "--license") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        result.assetLicense = value;
      }
      continue;
    }
    if (current === "--notes") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        result.assetNotes = value;
      }
      continue;
    }
    if (current === "--subdir") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        result.assetSubdir = value;
      }
      continue;
    }
    if (current === "--source") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        result.assetSource = value;
      }
      continue;
    }
    if (current === "--textures") {
      result.assetTextures = true;
      continue;
    }
    if (current === "--expect") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        result.expectPath = value;
      }
      continue;
    }
    if (current === "--write") {
      result.write = true;
      continue;
    }
    if (current === "--check") {
      // explicit dry-run; --write is the only flag that triggers mutation
      result.write = false;
      continue;
    }
    if (current === "--build") {
      result.build = true;
      continue;
    }
    if (current === "--diagnostics-from") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) result.diagnosticsFrom = value;
      continue;
    }
    if (current === "--seed") {
      const value = args[++index];
      if (value !== undefined) result.seed = Number(value);
      continue;
    }
    if (current === "--template") {
      const value = args[++index];
      if (value !== undefined) result.template = value;
      continue;
    }
    if (current === "--out") {
      const value = args[++index];
      if (value !== undefined) result.outPath = value;
      continue;
    }
    if (current === "--params") {
      const value = args[++index];
      if (value !== undefined) result.paramsJson = value;
      continue;
    }
    if (current.startsWith("--")) {
      continue;
    }
    result.positional.push(current);
  }

  const firstPositional = result.positional[0];
  if (firstPositional !== undefined) {
    result.projectDir = firstPositional;
  }

  return result;
}

function printUsage(): void {
  console.error(
    [
      "Usage:",
      "  engine check <projectDir> [--json] [--save <path>]",
      "  engine inspect <projectDir> [--component <Name>] [--query A,B] [--entity <id>] [--tail N] [--exclude-component N1,N2] [--components-only] [--watch] [--on-change <cmd>] [--json] [--save <path>]",
      "  engine inspect --diff <previous.json> <next.json> [--tail N] [--json] [--save <path>]",
      "  engine summarize <projectDir> [--json] [--save <path>]",
      "  engine doctor <projectDir> [--build] [--json] [--save <path>]",
      "  engine migrate <projectDir> [--dry-run] [--json] [--save <path>]",
      "  engine asset import <projectDir> <sourceFile> --id <id> [--kind ...] [--license ...] [--notes ...] [--subdir ...]",
      "  engine replay <recording.json> [--expect <snapshot.json>] [--json] [--save <path>]",
      "  engine docs <projectDir> [--json] [--save <path>]",
      "  engine patch <projectDir> <patch.json> [--check|--write] [--json] [--save <path>]",
      "  engine list components [projectDir] [--json] [--save <path>]",
      "  engine list examples [--json] [--save <path>]",
      "  engine explain component <ComponentName> [projectDir] [--json] [--save <path>]",
      "  engine new <projectName> [--template <templateId>] [--target <dir>] [--json] [--save <path>]",
      "  engine screenshot <projectId> --out <path.png> [--server-url <url>] [--reuse-server] [--json] [--save <path>]"
    ].join("\n")
  );
}
