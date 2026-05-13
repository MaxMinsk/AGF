import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, watch as fsWatch } from "node:fs";
import { dirname, resolve } from "node:path";
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
  const report = runDoctor(parsedArgs.projectDir);
  emitResult(report, parsedArgs, () => formatDoctor(report));
  process.exitCode = report.ok ? 0 : 1;
} else if (parsedArgs.command === "asset") {
  const positional = parsedArgs.positional;
  const sub = positional[1];
  const sourceFile = positional[2];
  if (sub !== "import" || sourceFile === undefined || parsedArgs.assetId === undefined) {
    console.error(
      "Usage: engine asset import <projectDir> <sourceFile> --id <id> [--kind ...] [--license ...] [--notes ...] [--subdir ...]"
    );
    process.exitCode = 2;
  } else {
    const importOptions: Parameters<typeof importAsset>[0] = {
      projectDir: parsedArgs.projectDir,
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
} else {
  printUsage();
  process.exitCode = 2;
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
      "  engine doctor <projectDir> [--json] [--save <path>]",
      "  engine migrate <projectDir> [--dry-run] [--json] [--save <path>]",
      "  engine asset import <projectDir> <sourceFile> --id <id> [--kind ...] [--license ...] [--notes ...] [--subdir ...]"
    ].join("\n")
  );
}
