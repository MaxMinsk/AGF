// ASSET-optimize-command (M25): batch-compress every GLB under
// `<projectDir>/assets/_sources/**/*.glb` and emit a 1:1 mirror tree
// under `<projectDir>/assets/runtime/...`. The default pipeline is
// "dedup → prune → weld → meshopt", which is conservative + lossless
// for AGF's gameplay-grade meshes.
//
// KTX2 / Basis texture compression is NOT bundled here yet — the
// `basisu` CLI binary is a separate install + needs per-channel
// policy authoring. ASSET-texture-compress lands that work behind a
// `--textures` flag once the toolchain is committed to.
//
// Decoder paths (DRACO/KTX2 transcoders) live in
// `engine/render/asset-decoders/decoders.ts` (S38); they're consumed by
// the RUNTIME side. The OFFLINE pipeline here writes outputs that
// those decoders can load.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { dedup, prune, weld, meshopt, textureCompress } from "@gltf-transform/functions";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
// The offline pipeline pulls Meshopt's encoder + decoder from the
// upstream `meshoptimizer` package (gltf-transform's `meshopt` pass
// expects this exact API surface). The runtime side keeps using
// three's bundled decoder via `engine/render/asset-decoders/decoders.ts`.
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

export type AssetOptimizeReport = {
  /** Per-asset summary, in input-order. */
  entries: AssetOptimizeEntry[];
  /** Aggregate bytes saved (positive = output smaller than input). */
  totalBytesSaved: number;
};

export type AssetOptimizeEntry = {
  /** Path relative to project root (`assets/_sources/...`). */
  source: string;
  /** Path relative to project root (`assets/runtime/...`). */
  output: string;
  inputBytes: number;
  outputBytes: number;
  /** Reason the entry was skipped, or undefined when it ran. */
  skipped?: string;
};

export type AssetOptimizeOptions = {
  /** Run dedup pass. Default true. */
  dedup?: boolean;
  /** Run prune pass. Default true. */
  prune?: boolean;
  /** Run weld pass. Default true. */
  weld?: boolean;
  /** Run meshopt compression. Default true. */
  meshopt?: boolean;
  /**
   * Run textureCompress (`webp` codec). Default false — textureCompress
   * needs the `sharp` package present in the environment running the
   * CLI. Opt in once the host has it.
   */
  textures?: boolean;
  /**
   * S54: when set, process ONLY the given file path (relative to
   * `<projectDir>` or absolute) instead of every `.glb` under
   * `assets/_sources/`. The file still has to live under
   * `assets/_sources/` so the output target lands at the matching
   * `assets/runtime/` mirror path.
   */
  source?: string;
};

const DEFAULT_OPTIONS = {
  dedup: true,
  prune: true,
  weld: true,
  meshopt: true,
  textures: false
} as const;

export async function optimizeProjectAssets(
  projectDir: string,
  options: AssetOptimizeOptions = {}
): Promise<AssetOptimizeReport> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sourcesDir = resolve(projectDir, "assets/_sources");
  const runtimeDir = resolve(projectDir, "assets/runtime");
  if (!existsSync(sourcesDir) || !statSync(sourcesDir).isDirectory()) {
    return { entries: [], totalBytesSaved: 0 };
  }
  const sources: string[] = [];
  if (options.source !== undefined) {
    // S54: per-file mode. Resolve against projectDir if relative; the
    // file MUST land under `assets/_sources/` so the runtime mirror
    // path stays well-defined.
    const sourcePath = resolve(projectDir, options.source);
    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
      throw new Error(`asset optimize: source "${options.source}" not found.`);
    }
    if (!sourcePath.startsWith(sourcesDir + "/") && sourcePath !== sourcesDir) {
      throw new Error(
        `asset optimize: source "${options.source}" must live under assets/_sources/.`
      );
    }
    if (!sourcePath.toLowerCase().endsWith(".glb")) {
      throw new Error(`asset optimize: only .glb files are supported (got "${options.source}").`);
    }
    sources.push(sourcePath);
  } else {
    for (const file of walkGlbs(sourcesDir)) sources.push(file);
    sources.sort();
  }
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder
    });
  const entries: AssetOptimizeEntry[] = [];
  let totalSaved = 0;
  for (const source of sources) {
    const relSource = relative(projectDir, source);
    const relTarget = relSource.replace(/^assets\/_sources\//, "assets/runtime/");
    const target = resolve(projectDir, relTarget);
    const inputBytes = statSync(source).size;
    try {
      const document = await io.read(source);
      const transforms: Parameters<typeof document.transform>[number][] = [];
      if (opts.dedup) transforms.push(dedup());
      if (opts.prune) transforms.push(prune());
      if (opts.weld) transforms.push(weld());
      if (opts.meshopt) transforms.push(meshopt({ encoder: MeshoptEncoder }));
      if (opts.textures) transforms.push(textureCompress({}));
      await document.transform(...transforms);
      mkdirSync(dirname(target), { recursive: true });
      await io.write(target, document);
      const outputBytes = statSync(target).size;
      const saved = inputBytes - outputBytes;
      totalSaved += saved;
      entries.push({ source: relSource, output: relTarget, inputBytes, outputBytes });
    } catch (error) {
      entries.push({
        source: relSource,
        output: relTarget,
        inputBytes,
        outputBytes: 0,
        skipped: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return { entries, totalBytesSaved: totalSaved };
}

export function formatAssetOptimizeReport(report: AssetOptimizeReport): string {
  if (report.entries.length === 0) {
    return "asset optimize: no .glb files under assets/_sources/";
  }
  const lines: string[] = [];
  lines.push(`asset optimize: ${report.entries.length} file(s), ${formatKb(report.totalBytesSaved)} saved`);
  for (const entry of report.entries) {
    if (entry.skipped !== undefined) {
      lines.push(`  SKIP ${entry.source}: ${entry.skipped}`);
      continue;
    }
    const ratio = entry.inputBytes === 0
      ? 0
      : ((entry.inputBytes - entry.outputBytes) / entry.inputBytes) * 100;
    lines.push(
      `  ${entry.source} → ${entry.output}   ${formatKb(entry.inputBytes)} → ${formatKb(entry.outputBytes)} (${ratio.toFixed(1)}%)`
    );
  }
  return lines.join("\n");
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function* walkGlbs(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = resolve(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkGlbs(full);
    } else if (name.endsWith(".glb") || name.endsWith(".gltf")) {
      yield full;
    }
  }
}

// Silence the unused-import lint for readFileSync/writeFileSync — the
// NodeIO uses them internally but tooling occasionally flags the
// top-level import.
void readFileSync;
void writeFileSync;
