// `engine doctor <projectDir>` — agent scorecard.
//
// Combines: `engine check` diagnostics, `engine summarize` output, optional
// performance-budget.json validation. Does NOT run e2e or browser smoke; if
// the agent needs that, prints the canonical commands.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { checkProject, type Diagnostic } from "../check/project-check";
import { summarizeProject, type ProjectSummary } from "../summarize/project-summarize";
import {
  analyzeBatchCandidates,
  formatBatchCandidates,
  type BatchCandidateReport
} from "./batch-candidates";
import {
  analyzeMaterialSharing,
  formatMaterialSharing,
  type MaterialSharingReport
} from "./material-sharing";
import {
  scanProjectTextures,
  formatTextureDoctor,
  type TextureDoctorReport
} from "./texture-doctor";

export type PerformanceBudget = {
  agfFormatVersion: number;
  renderer?: {
    soft?: Partial<Record<RendererMetric, number>>;
    hard?: Partial<Record<RendererMetric, number>>;
  };
  bundle?: {
    /** Budget for the largest non-vendor (main) chunk in `dist/assets`. */
    softLargestChunkGzipKb?: number;
    hardLargestChunkGzipKb?: number;
    /**
     * Optional per-vendor budgets keyed by chunk-name prefix (matches
     * `scripts/check-bundle-size.mjs`). When omitted, the doctor falls back
     * to DEFAULT_VENDOR_BUDGETS so projects don't accidentally fail because
     * a lazy-loaded vendor chunk (e.g. Rapier WASM) is larger than the
     * project's main-chunk budget.
     */
    vendors?: Record<string, { softGzipKb?: number; hardGzipKb?: number }>;
  };
};

/**
 * Default vendor-chunk budgets mirroring `scripts/check-bundle-size.mjs`.
 * Doctor uses these when the project's `performance-budget.json` does not
 * declare its own `bundle.vendors` overrides. Keys are Rollup chunk-name
 * prefixes; the hash suffix is ignored.
 *
 * If a chunk does not match any vendor prefix it is treated as a main chunk
 * and weighed against `bundle.softLargestChunkGzipKb` / `hardLargestChunkGzipKb`.
 */
export const DEFAULT_VENDOR_BUDGETS: Record<string, { softGzipKb?: number; hardGzipKb: number }> = {
  "rapier-": { hardGzipKb: 900 },
  "three-": { hardGzipKb: 300 }
};

export type RendererMetric =
  | "geometries"
  | "textures"
  | "programs"
  | "drawCalls"
  | "triangles"
  | "meshes"
  // M21-light-budgets: add light counters so projects can cap active
  // lights / shadow-casting lights / shadow map memory.
  | "lights"
  | "shadowCasters";

export type BundleStat = {
  largestChunk: string;
  largestChunkGzipKb: number;
  /** Violation level vs the project's bundle budget, if one is configured. */
  violation: "hard" | "soft" | "none";
};

export type VendorBundleStat = {
  /** Vendor chunk prefix (without hash), e.g. `rapier-`. */
  prefix: string;
  /** Full chunk file name as emitted by Rollup, e.g. `rapier-Ch5MPf19.js`. */
  chunkName: string;
  gzipKb: number;
  hardGzipKb: number | undefined;
  softGzipKb: number | undefined;
  violation: "hard" | "soft" | "none";
};

export type BatchingConfigReport = {
  /** project.json#render.batching.auto (defaults to false when absent). */
  autoBatch: boolean;
  /** project.json#render.batching.path — `instanced` (default) or `batched`. */
  path: "instanced" | "batched" | "batched-bvh";
  /** Renderable entities whose mesh is a built-in primitive (box / sphere / plane). */
  primitiveCount: number;
  /** Distinct bucket keys among the primitive entities (mesh + material profile + shadow flags + group). */
  primitiveBucketCount: number;
  /** Renderable entities whose mesh ref points to an external asset (.glb / .gltf). */
  externalCount: number;
  /** Distinct bucket keys among the external mesh entities. */
  externalBucketCount: number;
  /** Entities that carry an explicit `Batchable` component in scene JSON. */
  explicitBatchableCount: number;
  /** Entities with `Batchable: { enabled: false }` — opted out even with auto-batch on. */
  optedOutCount: number;
  /**
   * S53 DOCTOR-renderer-pool-section: per-path entity count with the
   * per-entity `Batchable.path` override applied on top of the
   * project-level `render.batching.path` default. Lets agents see at a
   * glance which pool path each scene actually targets.
   */
  pathDistribution: {
    instanced: number;
    batched: number;
    batchedBvh: number;
  };
};

export type DoctorReport = {
  projectDir: string;
  ok: boolean;
  diagnostics: Diagnostic[];
  summary: ProjectSummary;
  budget: PerformanceBudget | undefined;
  /** Main-chunk size + violation vs the project's `bundle.{soft,hard}LargestChunkGzipKb`. */
  bundle: BundleStat | undefined;
  /**
   * Per-vendor chunk stats. Each vendor matched by prefix is reported separately
   * with its own budget, so a lazy-loaded Rapier chunk doesn't fail a project
   * that only enforces a main-chunk budget.
   */
  vendorBundles: VendorBundleStat[];
  /** Static M17-doctor analysis: how many entities would collapse into batched draw calls. */
  batchCandidates: BatchCandidateReport;
  /** S51-doctor: actual auto-batch config + per-class entity counts. */
  batching: BatchingConfigReport;
  /** Material-manifest deduplication report (M17-material-sharing-doctor). */
  materialSharing: MaterialSharingReport;
  /** S52-doctor: shadow config snapshot + cascade cost recommendation. */
  shadows: ShadowConfigReport;
  /** S54 ASSET-texture-doctor: huge / NPOT / no-transcoder findings. */
  textures: TextureDoctorReport;
  recommendations: string[];
};

export type ShadowConfigReport = {
  /** `project.json#render.shadows.algorithm` — defaults to `pcf` per the schema. */
  algorithm: "pcf" | "vsm" | "pcss";
  /** `project.json#render.shadows.autoUpdate` — defaults to true. */
  autoUpdate: boolean;
  /** Whether CSM is enabled via `render.shadows.csm.enabled`. */
  csmEnabled: boolean;
  /** Cascade count when CSM is on (otherwise undefined). */
  cascades: number | undefined;
  /** Cascade-shadow-map size when CSM is on. */
  shadowMapSize: number | undefined;
  /** Entities tagged `ShadowCaster { dynamic: true }` across all scenes. */
  dynamicCasterCount: number;
  /** Entities tagged `ShadowCaster { dynamic: false }` explicitly. */
  staticCasterCount: number;
};

export type DoctorOptions = {
  /** When true, `runDoctor` invokes `npm run build` if `dist/` is missing. */
  build?: boolean;
};

export function runDoctor(
  projectDirInput: string,
  repoRoot?: string,
  options: DoctorOptions = {}
): DoctorReport {
  const projectDir = resolve(projectDirInput);
  const root = resolve(repoRoot ?? process.cwd());
  const check = checkProject(projectDir);
  const summary = summarizeProject(projectDir);
  const budgetPath = resolve(projectDir, "performance-budget.json");
  let budget: PerformanceBudget | undefined;
  if (existsSync(budgetPath)) {
    budget = JSON.parse(readFileSync(budgetPath, "utf8")) as PerformanceBudget;
  }

  const distDir = resolve(root, "dist/assets");
  if (options.build === true && !existsSync(distDir)) {
    console.error(`[engine doctor] dist/ missing — running \`npm run build\` first...`);
    const buildResult = spawnSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
    if (buildResult.status !== 0) {
      console.error(`[engine doctor] \`npm run build\` failed (exit ${buildResult.status}).`);
    }
  }

  const { mainChunk, vendorChunks } = measureBundles(root, budget);
  const bundle = mainChunk;
  const vendorBundles = vendorChunks;

  const recommendations: string[] = [];
  const errorCount = check.diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = check.diagnostics.filter((d) => d.severity === "warning").length;
  if (errorCount > 0) {
    recommendations.push(
      `Fix ${errorCount} engine-check error(s) — run \`npm run engine:check -- ${projectDir}\` for full output.`
    );
  } else if (warningCount > 0) {
    recommendations.push(
      `Address ${warningCount} engine-check warning(s) when convenient (\`npm run engine:check -- ${projectDir}\`).`
    );
  }
  if (summary.playtests.length === 0) {
    recommendations.push(
      `No playtest scenarios under \`examples/${summary.project.id}/playtests/\` — capture one with \`npm run playtest examples/${summary.project.id}\`.`
    );
  }
  if (budget === undefined) {
    recommendations.push(
      `No performance-budget.json — add one to enforce renderer / bundle ceilings (\`schemas/performance-budget.schema.json\` for the shape).`
    );
  }
  if (bundle === undefined) {
    recommendations.push(
      `No \`dist/assets\` build present — run \`npm run build\` so \`engine doctor\` can report bundle size.`
    );
  } else if (bundle.violation === "hard") {
    recommendations.push(
      `Main JS chunk \`${bundle.largestChunk}\` is ${bundle.largestChunkGzipKb.toFixed(1)} KB gzipped — over the hard bundle budget.`
    );
  } else if (bundle.violation === "soft") {
    recommendations.push(
      `Main JS chunk \`${bundle.largestChunk}\` is ${bundle.largestChunkGzipKb.toFixed(1)} KB gzipped — over the soft bundle budget (still under hard).`
    );
  }
  for (const v of vendorBundles) {
    if (v.violation === "hard") {
      recommendations.push(
        `Vendor chunk \`${v.chunkName}\` is ${v.gzipKb.toFixed(1)} KB gzipped — over the hard vendor budget (${v.hardGzipKb} KB).`
      );
    } else if (v.violation === "soft") {
      recommendations.push(
        `Vendor chunk \`${v.chunkName}\` is ${v.gzipKb.toFixed(1)} KB gzipped — over the soft vendor budget (${v.softGzipKb} KB).`
      );
    }
  }
  recommendations.push(
    `For browser smoke and HMR, run \`npm run test:e2e\` and \`npm run dev\` (engine doctor stays headless).`
  );

  const batchCandidates = analyzeBatchCandidates(projectDir);
  const batching = summarizeBatching(projectDir, batchCandidates);
  const primitivePotentialSavings = batching.primitiveCount - batching.primitiveBucketCount;
  if (!batching.autoBatch && primitivePotentialSavings > 0) {
    // S53: default flipped to true, so an explicit `auto: false` is
    // the only reason a primitive-rich scene would still be in the
    // single-Mesh path. Surface the explicit opt-out so the agent
    // knows the value was set deliberately, not forgotten.
    recommendations.push(
      `Auto-batch is explicitly disabled (\`render.batching.auto: false\`) — collapsing ${batching.primitiveCount} primitive entit${batching.primitiveCount === 1 ? "y" : "ies"} into ${batching.primitiveBucketCount} bucket(s) would save ~${primitivePotentialSavings} draw call(s). Remove the field (or set to true) to take the default-on path.`
    );
  } else if (batchCandidates.potentialDrawCallSavings > 0 && primitivePotentialSavings === 0) {
    recommendations.push(
      `M17 batching could collapse ${batchCandidates.totalRenderable} renderables into ${batchCandidates.totalBuckets} bucket(s) — external-mesh batching kicks in once \`AssetRegistry\` has loaded the .glb geometry.`
    );
  }

  const materialSharing = analyzeMaterialSharing(projectDir);
  if (materialSharing.duplicates.length > 0) {
    const totalDuplicates = materialSharing.duplicates.reduce(
      (sum, group) => sum + group.manifests.length,
      0
    );
    recommendations.push(
      `${materialSharing.duplicates.length} duplicate material signature(s) across ${totalDuplicates} manifests — see the doctor output to merge them and shrink M17 bucket counts.`
    );
  }

  const shadows = summarizeShadows(projectDir);
  if (shadows.csmEnabled && shadows.cascades !== undefined && shadows.cascades >= 3) {
    recommendations.push(
      `CSM uses ${shadows.cascades} cascades — each is a full shadow pass per frame. The S51 shadow deep-dive measured ~17 % renderMs saved going from 3 → 2; consider downgrading for outdoor scenes that don't need extreme near-detail.`
    );
  }
  if (shadows.dynamicCasterCount === 0 && shadows.autoUpdate) {
    recommendations.push(
      `No \`ShadowCaster { dynamic: true }\` entities — every caster re-bakes every frame even though nothing moves. Tag the entities that actually animate (player / NPCs / animated props) so the renderer can skip the per-frame shadow pass when they're idle.`
    );
  }
  // S53 DOCTOR-renderer-pool-section: recommend the BVH-augmented
  // BatchedMesh path when the project uses `batched` and the scene
  // shape (lots of primitives) is the one S53's perf-rerun showed
  // strictly dominates vanilla `batched`.
  if (batching.path === "batched" && (batching.primitiveCount > 0 || batching.externalCount > 0)) {
    recommendations.push(
      `\`render.batching.path\` is the legacy "batched" — try "batched-bvh" (S53). The BVH-augmented path strictly dominated vanilla batched on shadows-bench (renderMs −23 %, triangles −81 %) thanks to the BVH walk replacing the O(N) per-instance frustum loop.`
    );
  }

  const ok =
    check.ok &&
    bundle?.violation !== "hard" &&
    vendorBundles.every((v) => v.violation !== "hard");

  const textures = scanProjectTextures(projectDir);
  if (textures.findings.length > 0) {
    recommendations.push(
      `${textures.findings.length} texture warning(s) — see the Textures section in the doctor output (run \`npm run engine:doctor -- ${projectDir}\` for details).`
    );
  }

  return {
    projectDir,
    ok,
    diagnostics: check.diagnostics,
    summary,
    budget,
    bundle,
    vendorBundles,
    batchCandidates,
    batching,
    materialSharing,
    shadows,
    textures,
    recommendations
  };
}

function summarizeShadows(projectDir: string): ShadowConfigReport {
  const projectPath = resolve(projectDir, "project.json");
  let algorithm: "pcf" | "vsm" | "pcss" = "pcf";
  let autoUpdate = true;
  let csmEnabled = false;
  let cascades: number | undefined;
  let shadowMapSize: number | undefined;
  if (existsSync(projectPath)) {
    try {
      const project = JSON.parse(readFileSync(projectPath, "utf8")) as {
        render?: {
          shadows?: {
            algorithm?: "pcf" | "vsm" | "pcss";
            autoUpdate?: boolean;
            csm?: { enabled?: boolean; cascades?: number; shadowMapSize?: number };
          };
        };
      };
      algorithm = project.render?.shadows?.algorithm ?? "pcf";
      autoUpdate = project.render?.shadows?.autoUpdate !== false;
      csmEnabled = project.render?.shadows?.csm?.enabled === true;
      cascades = project.render?.shadows?.csm?.cascades;
      shadowMapSize = project.render?.shadows?.csm?.shadowMapSize;
    } catch {
      // project-check reports malformed project.json; defaults stay.
    }
  }

  const { dynamicCasterCount, staticCasterCount } = countShadowCasters(projectDir);
  return {
    algorithm,
    autoUpdate,
    csmEnabled,
    cascades,
    shadowMapSize,
    dynamicCasterCount,
    staticCasterCount
  };
}

function countShadowCasters(projectDir: string): {
  dynamicCasterCount: number;
  staticCasterCount: number;
} {
  const scenesDir = resolve(projectDir, "scenes");
  let dynamicCasterCount = 0;
  let staticCasterCount = 0;
  if (!existsSync(scenesDir) || !statSync(scenesDir).isDirectory()) {
    return { dynamicCasterCount, staticCasterCount };
  }
  const stack: string[] = [scenesDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) break;
    for (const name of readdirSync(dir)) {
      const full = resolve(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!name.endsWith(".scene.json")) continue;
      let scene: { entities?: Array<{ components?: Record<string, unknown> }> };
      try {
        scene = JSON.parse(readFileSync(full, "utf8"));
      } catch {
        continue;
      }
      for (const entity of scene.entities ?? []) {
        const tag = entity.components?.["ShadowCaster"] as { dynamic?: boolean } | undefined;
        if (tag === undefined) continue;
        if (tag.dynamic === true) dynamicCasterCount += 1;
        else staticCasterCount += 1;
      }
    }
  }
  return { dynamicCasterCount, staticCasterCount };
}

const PRIMITIVE_MESHES = new Set(["box", "sphere", "plane"]);

function summarizeBatching(
  projectDir: string,
  batchCandidates: BatchCandidateReport
): BatchingConfigReport {
  const projectPath = resolve(projectDir, "project.json");
  // S53 M17-batch-default-on: default is now true (was false before
  // S53). Only an explicit `auto: false` keeps the legacy single-Mesh
  // path; absent / true → enabled.
  let autoBatch = true;
  let path: "instanced" | "batched" | "batched-bvh" = "instanced";
  if (existsSync(projectPath)) {
    try {
      const project = JSON.parse(readFileSync(projectPath, "utf8")) as {
        render?: { batching?: { auto?: boolean; path?: "instanced" | "batched" | "batched-bvh" } };
      };
      if (project.render?.batching?.auto === false) autoBatch = false;
      if (project.render?.batching?.path !== undefined) {
        path = project.render.batching.path;
      }
    } catch {
      // project-check reports malformed project.json; defaults stay.
    }
  }

  let primitiveCount = 0;
  let externalCount = 0;
  const primitiveBuckets = new Set<string>();
  const externalBuckets = new Set<string>();
  for (const bucket of batchCandidates.buckets) {
    if (PRIMITIVE_MESHES.has(bucket.mesh)) {
      primitiveCount += bucket.entities.length;
      primitiveBuckets.add(bucket.key);
    } else if (bucket.mesh.endsWith(".glb") || bucket.mesh.endsWith(".gltf")) {
      externalCount += bucket.entities.length;
      externalBuckets.add(bucket.key);
    }
  }

  const { explicitBatchableCount, optedOutCount, pathOverrides } = countExplicitBatchable(projectDir);

  // Each batchable entity lands on `Batchable.path` if set, else the
  // project-level `path` default. Total batchable count = primitives
  // + externals minus opt-outs (those go to the single-Mesh path,
  // not counted under any pool).
  const totalBatchable = Math.max(0, primitiveCount + externalCount - optedOutCount);
  const overriddenTotal =
    pathOverrides.instanced + pathOverrides.batched + pathOverrides.batchedBvh;
  const defaultEntitiesCount = Math.max(0, totalBatchable - overriddenTotal);
  const pathDistribution = {
    instanced: pathOverrides.instanced + (path === "instanced" ? defaultEntitiesCount : 0),
    batched: pathOverrides.batched + (path === "batched" ? defaultEntitiesCount : 0),
    batchedBvh: pathOverrides.batchedBvh + (path === "batched-bvh" ? defaultEntitiesCount : 0)
  };

  return {
    autoBatch,
    path,
    primitiveCount,
    primitiveBucketCount: primitiveBuckets.size,
    externalCount,
    externalBucketCount: externalBuckets.size,
    explicitBatchableCount,
    optedOutCount,
    pathDistribution
  };
}

function countExplicitBatchable(projectDir: string): {
  explicitBatchableCount: number;
  optedOutCount: number;
  pathOverrides: { instanced: number; batched: number; batchedBvh: number };
} {
  const scenesDir = resolve(projectDir, "scenes");
  let explicitBatchableCount = 0;
  let optedOutCount = 0;
  const pathOverrides = { instanced: 0, batched: 0, batchedBvh: 0 };
  if (!existsSync(scenesDir) || !statSync(scenesDir).isDirectory()) {
    return { explicitBatchableCount, optedOutCount, pathOverrides };
  }
  const stack: string[] = [scenesDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) break;
    for (const name of readdirSync(dir)) {
      const full = resolve(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!name.endsWith(".scene.json")) continue;
      let scene: { entities?: Array<{ components?: Record<string, unknown> }> };
      try {
        scene = JSON.parse(readFileSync(full, "utf8"));
      } catch {
        continue;
      }
      for (const entity of scene.entities ?? []) {
        const batchable = entity.components?.["Batchable"] as
          | { enabled?: boolean; path?: "instanced" | "batched" | "batched-bvh" }
          | undefined;
        if (batchable === undefined) continue;
        if (batchable.enabled === false) {
          optedOutCount += 1;
        } else {
          explicitBatchableCount += 1;
        }
        // Path override counts a renderable entity even when
        // batchable.enabled isn't false; tracked separately so
        // the path distribution and explicit count don't leak
        // into each other.
        if (batchable.path === "instanced") pathOverrides.instanced += 1;
        else if (batchable.path === "batched") pathOverrides.batched += 1;
        else if (batchable.path === "batched-bvh") pathOverrides.batchedBvh += 1;
      }
    }
  }
  return { explicitBatchableCount, optedOutCount, pathOverrides };
}

function measureBundles(
  repoRoot: string,
  budget: PerformanceBudget | undefined
): { mainChunk: BundleStat | undefined; vendorChunks: VendorBundleStat[] } {
  const assetsDir = resolve(repoRoot, "dist/assets");
  if (!existsSync(assetsDir) || !statSync(assetsDir).isDirectory()) {
    return { mainChunk: undefined, vendorChunks: [] };
  }
  const vendorBudgets: Record<string, { softGzipKb?: number; hardGzipKb?: number }> = {
    ...DEFAULT_VENDOR_BUDGETS,
    ...(budget?.bundle?.vendors ?? {})
  };
  const vendorPrefixes = Object.keys(vendorBudgets).sort((a, b) => b.length - a.length);

  let mainLargestBytes = 0;
  let mainLargestName = "";
  const vendorByPrefix = new Map<string, { name: string; bytes: number }>();

  for (const name of readdirSync(assetsDir)) {
    if (!name.endsWith(".js")) continue;
    const full = resolve(assetsDir, name);
    const gzipped = gzipSync(readFileSync(full)).length;
    const prefix = vendorPrefixes.find((p) => name.startsWith(p));
    if (prefix !== undefined) {
      const prev = vendorByPrefix.get(prefix);
      if (prev === undefined || gzipped > prev.bytes) {
        vendorByPrefix.set(prefix, { name, bytes: gzipped });
      }
      continue;
    }
    if (gzipped > mainLargestBytes) {
      mainLargestBytes = gzipped;
      mainLargestName = name;
    }
  }

  let mainChunk: BundleStat | undefined;
  if (mainLargestName !== "") {
    const gzipKb = mainLargestBytes / 1024;
    let violation: BundleStat["violation"] = "none";
    if (
      budget?.bundle?.hardLargestChunkGzipKb !== undefined &&
      gzipKb > budget.bundle.hardLargestChunkGzipKb
    ) {
      violation = "hard";
    } else if (
      budget?.bundle?.softLargestChunkGzipKb !== undefined &&
      gzipKb > budget.bundle.softLargestChunkGzipKb
    ) {
      violation = "soft";
    }
    mainChunk = {
      largestChunk: mainLargestName,
      largestChunkGzipKb: gzipKb,
      violation
    };
  }

  const vendorChunks: VendorBundleStat[] = [];
  for (const prefix of vendorPrefixes) {
    const measured = vendorByPrefix.get(prefix);
    if (measured === undefined) continue;
    const budgetEntry = vendorBudgets[prefix] ?? {};
    const gzipKb = measured.bytes / 1024;
    let violation: VendorBundleStat["violation"] = "none";
    if (budgetEntry.hardGzipKb !== undefined && gzipKb > budgetEntry.hardGzipKb) {
      violation = "hard";
    } else if (budgetEntry.softGzipKb !== undefined && gzipKb > budgetEntry.softGzipKb) {
      violation = "soft";
    }
    vendorChunks.push({
      prefix,
      chunkName: measured.name,
      gzipKb,
      hardGzipKb: budgetEntry.hardGzipKb,
      softGzipKb: budgetEntry.softGzipKb,
      violation
    });
  }

  return { mainChunk, vendorChunks };
}

export function formatDoctor(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`Doctor: ${report.summary.project.name} (${report.summary.project.id})`);
  lines.push(`  status: ${report.ok ? "OK" : "ERRORS"}`);
  lines.push("");

  lines.push(`Diagnostics (${report.diagnostics.length}):`);
  if (report.diagnostics.length === 0) {
    lines.push("  (none)");
  } else {
    for (const d of report.diagnostics) {
      lines.push(`  ${d.severity.toUpperCase()} ${d.code} ${d.file} ${d.path}`);
    }
  }
  lines.push("");

  lines.push(`Project shape:`);
  lines.push(`  scene: ${report.summary.scene.id} — ${report.summary.scene.entityCount} entities`);
  lines.push(`  project-local components: ${report.summary.components.projectLocal.length}`);
  lines.push(`  declared asset entries: ${report.summary.assets.declaredEntries}`);
  lines.push(`  playtests: ${report.summary.playtests.length}`);
  lines.push("");

  if (report.budget !== undefined) {
    lines.push("Performance budget:");
    if (report.budget.renderer !== undefined) {
      const soft = report.budget.renderer.soft ?? {};
      const hard = report.budget.renderer.hard ?? {};
      lines.push(`  renderer soft: ${JSON.stringify(soft)}`);
      lines.push(`  renderer hard: ${JSON.stringify(hard)}`);
    }
    if (report.budget.bundle !== undefined) {
      lines.push(
        `  bundle: soft ${report.budget.bundle.softLargestChunkGzipKb ?? "—"} KB, hard ${report.budget.bundle.hardLargestChunkGzipKb ?? "—"} KB`
      );
    }
  }
  if (report.bundle !== undefined) {
    lines.push(
      `  main chunk: \`${report.bundle.largestChunk}\` at ${report.bundle.largestChunkGzipKb.toFixed(1)} KB gzipped (${report.bundle.violation})`
    );
  }
  for (const v of report.vendorBundles) {
    const limit =
      v.hardGzipKb !== undefined
        ? `hard ${v.hardGzipKb} KB`
        : v.softGzipKb !== undefined
          ? `soft ${v.softGzipKb} KB`
          : "no budget";
    lines.push(
      `  vendor ${v.prefix}: \`${v.chunkName}\` at ${v.gzipKb.toFixed(1)} KB gzipped (${limit}, ${v.violation})`
    );
  }
  lines.push("");

  lines.push(formatBatching(report.batching));
  lines.push("");

  lines.push(formatShadows(report.shadows));
  lines.push("");

  lines.push(formatBatchCandidates(report.batchCandidates));
  lines.push("");

  lines.push(formatMaterialSharing(report.materialSharing));
  lines.push("");

  lines.push(formatTextureDoctor(report.textures));
  lines.push("");

  lines.push("Recommendations:");
  for (const reco of report.recommendations) {
    lines.push(`  - ${reco}`);
  }
  return lines.join("\n");
}

export function formatBatching(report: BatchingConfigReport): string {
  const lines: string[] = [];
  const autoLabel = report.autoBatch
    ? "ON (default since S53; explicit override via project.json#render.batching.auto)"
    : "OFF (explicit `render.batching.auto: false` in project.json — default would be ON)";
  lines.push(`Batching: auto=${autoLabel}, path=${report.path}`);
  if (report.primitiveCount > 0) {
    const savings = report.primitiveCount - report.primitiveBucketCount;
    const verb = report.autoBatch ? "collapse into" : "would collapse into";
    lines.push(
      `  primitives: ${report.primitiveCount} entit${report.primitiveCount === 1 ? "y" : "ies"} ${verb} ${report.primitiveBucketCount} bucket(s) — ${savings} draw call(s) ${report.autoBatch ? "saved" : "available"}`
    );
  } else {
    lines.push("  primitives: none");
  }
  if (report.externalCount > 0) {
    lines.push(
      `  external meshes: ${report.externalCount} entit${report.externalCount === 1 ? "y" : "ies"} across ${report.externalBucketCount} bucket(s) — batched once AssetRegistry has loaded the geometry`
    );
  }
  if (report.explicitBatchableCount > 0) {
    lines.push(`  explicit Batchable: ${report.explicitBatchableCount}`);
  }
  if (report.optedOutCount > 0) {
    lines.push(`  opted out (Batchable.enabled=false): ${report.optedOutCount}`);
  }
  // S53 DOCTOR-renderer-pool-section: per-path entity distribution.
  // Only worth printing when ≥1 entity actually targets a non-default
  // path — otherwise the project-level `path=...` line above already
  // carries the same information.
  const dist = report.pathDistribution;
  const distTotal = dist.instanced + dist.batched + dist.batchedBvh;
  const nonDefaultPaths =
    (report.path !== "instanced" && dist.instanced > 0) ||
    (report.path !== "batched" && dist.batched > 0) ||
    (report.path !== "batched-bvh" && dist.batchedBvh > 0);
  if (distTotal > 0 && nonDefaultPaths) {
    const parts: string[] = [];
    if (dist.instanced > 0) parts.push(`${dist.instanced} instanced`);
    if (dist.batched > 0) parts.push(`${dist.batched} batched`);
    if (dist.batchedBvh > 0) parts.push(`${dist.batchedBvh} batched-bvh`);
    lines.push(`  path distribution (with per-entity overrides): ${parts.join(", ")}`);
  }
  return lines.join("\n");
}

export function formatShadows(report: ShadowConfigReport): string {
  const lines: string[] = [];
  const cascadesLabel = report.csmEnabled
    ? `CSM × ${report.cascades ?? "?"} cascade(s), ${report.shadowMapSize ?? "?"}px map`
    : "single-light shadows (no CSM)";
  lines.push(`Shadows: algorithm=${report.algorithm.toUpperCase()}, autoUpdate=${report.autoUpdate ? "ON" : "OFF"}, ${cascadesLabel}`);
  if (report.dynamicCasterCount > 0 || report.staticCasterCount > 0) {
    lines.push(
      `  ShadowCaster tags: ${report.dynamicCasterCount} dynamic, ${report.staticCasterCount} explicit static (untagged entities are implicit static when any dynamic tag is present)`
    );
  } else {
    lines.push(`  ShadowCaster tags: (none) — every caster re-bakes every frame`);
  }
  return lines.join("\n");
}

export function compareRendererInfo(
  info: Record<RendererMetric, number>,
  budget: PerformanceBudget
): Array<{ metric: RendererMetric; observed: number; threshold: number; level: "soft" | "hard" }> {
  const violations: Array<{
    metric: RendererMetric;
    observed: number;
    threshold: number;
    level: "soft" | "hard";
  }> = [];
  const hard = budget.renderer?.hard ?? {};
  const soft = budget.renderer?.soft ?? {};
  for (const metric of [
    "geometries",
    "textures",
    "programs",
    "drawCalls",
    "triangles",
    "meshes",
    "lights",
    "shadowCasters"
  ] as const) {
    const observed = info[metric];
    const hardLimit = hard[metric];
    const softLimit = soft[metric];
    if (hardLimit !== undefined && observed > hardLimit) {
      violations.push({ metric, observed, threshold: hardLimit, level: "hard" });
    } else if (softLimit !== undefined && observed > softLimit) {
      violations.push({ metric, observed, threshold: softLimit, level: "soft" });
    }
  }
  return violations;
}
