// S45 AGENT-cli-new: scaffold a new project from an existing example.
//
// `engine new <name> --template <templateId> [--target <dir>]`
//
// What it does:
//   1. Resolves the template (defaults to `hello-3d`). The template must live
//      under `examples/<templateId>` and ship `project.json` + `template.json`.
//   2. Resolves the destination (defaults to `examples/<name>`).
//   3. Copies the template tree, skipping generated artifacts (`node_modules/`,
//      `dist/`, `*.tsbuildinfo`, `_sources/` for asset pipelines).
//   4. Rewrites `project.json`'s `id` + `name` to match the new project.
//   5. Rewrites `template.json`'s `templateId` to the new id.
//   6. Runs `engine check` on the resulting project to confirm it boots.
//
// Pure functions return a `NewProjectResult` so callers can wrap it (CLI,
// future test harness). The CLI surfaces a short success summary or the
// first engine-check error.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, cpSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProject, type Diagnostic } from "../check/project-check";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

const IGNORE_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "_sources",
  ".vite",
  ".turbo"
]);
const IGNORE_FILE_SUFFIXES = [".tsbuildinfo", ".log"];

export type NewProjectOptions = {
  name: string;
  templateId?: string;
  targetDir?: string;
};

export type NewProjectResult = {
  ok: boolean;
  templateId: string;
  templateDir: string;
  projectDir: string;
  projectId: string;
  filesCopied: number;
  rewritten: string[];
  diagnostics: Diagnostic[];
  error: string | undefined;
};

function copyTree(src: string, dest: string): { count: number } {
  let count = 0;
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORE_DIR_NAMES.has(entry.name)) continue;
      const child = join(src, entry.name);
      const out = join(dest, entry.name);
      mkdirSync(out, { recursive: true });
      const r = copyTree(child, out);
      count += r.count;
      continue;
    }
    if (entry.isFile()) {
      if (IGNORE_FILE_SUFFIXES.some((s) => entry.name.endsWith(s))) continue;
      cpSync(join(src, entry.name), join(dest, entry.name));
      count += 1;
    }
  }
  return { count };
}

function validateName(name: string): string | undefined {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return `Project name must match /^[a-z][a-z0-9-]*$/ (got "${name}").`;
  }
  return undefined;
}

export function createProjectFromTemplate(options: NewProjectOptions): NewProjectResult {
  const templateId = options.templateId ?? "hello-3d";
  const templateDir = resolve(repoRoot, "examples", templateId);
  const projectId = options.name;
  const projectDir = resolve(
    options.targetDir ?? resolve(repoRoot, "examples", projectId)
  );
  const empty: NewProjectResult = {
    ok: false,
    templateId,
    templateDir,
    projectDir,
    projectId,
    filesCopied: 0,
    rewritten: [],
    diagnostics: [],
    error: undefined
  };

  const nameError = validateName(projectId);
  if (nameError !== undefined) return { ...empty, error: nameError };

  if (!existsSync(templateDir) || !statSync(templateDir).isDirectory()) {
    return { ...empty, error: `Template directory not found: ${templateDir}` };
  }
  if (!existsSync(join(templateDir, "project.json"))) {
    return { ...empty, error: `Template missing project.json: ${templateDir}` };
  }
  if (existsSync(projectDir)) {
    return { ...empty, error: `Destination already exists: ${projectDir}` };
  }

  mkdirSync(projectDir, { recursive: true });
  const copyResult = copyTree(templateDir, projectDir);

  const rewritten: string[] = [];

  // Rewrite project.json — id + name follow the new project.
  const projectPath = join(projectDir, "project.json");
  const project = JSON.parse(readFileSync(projectPath, "utf8")) as {
    id?: string;
    name?: string;
    [key: string]: unknown;
  };
  project.id = projectId;
  project.name = projectId
    .split("-")
    .map((p) => (p.length === 0 ? p : p[0]!.toUpperCase() + p.slice(1)))
    .join(" ");
  writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
  rewritten.push("project.json");

  // Rewrite template.json if present — keep agents from copying the old templateId.
  const templateJsonPath = join(projectDir, "template.json");
  if (existsSync(templateJsonPath)) {
    const tmpl = JSON.parse(readFileSync(templateJsonPath, "utf8")) as {
      templateId?: string;
      name?: string;
      [key: string]: unknown;
    };
    tmpl.templateId = projectId;
    tmpl.name = project.name;
    writeFileSync(templateJsonPath, `${JSON.stringify(tmpl, null, 2)}\n`);
    rewritten.push("template.json");
  }

  const check = checkProject(projectDir);
  return {
    ok: check.ok,
    templateId,
    templateDir,
    projectDir,
    projectId,
    filesCopied: copyResult.count,
    rewritten,
    diagnostics: check.diagnostics,
    error: check.ok
      ? undefined
      : `Created at ${projectDir} but engine check reported ${check.diagnostics.length} diagnostic(s).`
  };
}

export function formatNewProjectResult(result: NewProjectResult): string {
  const lines: string[] = [];
  if (result.error !== undefined && !result.ok && result.filesCopied === 0) {
    lines.push(`engine new failed: ${result.error}`);
    return lines.join("\n");
  }
  lines.push(`Scaffolded ${result.projectId} from ${result.templateId}`);
  lines.push(`  template: ${result.templateDir}`);
  lines.push(`  project:  ${result.projectDir}`);
  lines.push(`  files copied: ${result.filesCopied}`);
  lines.push(`  rewritten: ${result.rewritten.join(", ")}`);
  if (result.diagnostics.length > 0) {
    lines.push(`  engine check: ${result.diagnostics.length} diagnostic(s):`);
    for (const d of result.diagnostics) {
      lines.push(`    ${d.severity.toUpperCase()} ${d.code} ${d.file} ${d.path}`);
    }
  } else {
    lines.push(`  engine check: OK`);
  }
  return lines.join("\n");
}
