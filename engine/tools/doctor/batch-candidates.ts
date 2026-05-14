// M17-doctor: static analysis of scene JSON answering "if M17 batching
// landed today, what would actually batch?". For each scene, walks every
// MeshRenderer entity and groups by the keys that M17 will key the
// BatchedMesh / InstancedMesh bucketer on:
//
//   group key = `${mesh}|${material ?? ""}|${shadowCast}:${shadowReceive}`
//
// Groups with size > 1 are batch candidates — they would collapse into a
// single draw call. Singletons are isolated — the report explains the
// most likely reason (unique mesh, unique material, opted out of shadow).
//
// This intentionally runs offline against scene JSON, not against a
// running World. The numbers are an *upper bound* on what M17 will save —
// runtime visibility culling can drop entities from a bucket but never
// add new ones.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

export type BatchCandidateEntry = {
  /** Entity id this MeshRenderer belongs to. */
  entityId: string;
  /** Scene file the entity was authored in, relative to the project dir. */
  scenePath: string;
  /** Mesh ref (primitive name or asset path). */
  mesh: string;
  /** Material ref or undefined for inline color. */
  material?: string;
  /** Inline color override; only meaningful when material is undefined. */
  color?: string;
  /** Per-mesh ShadowFlags.cast (default true if absent). */
  shadowCast: boolean;
  /** Per-mesh ShadowFlags.receive (default true if absent). */
  shadowReceive: boolean;
};

export type BatchCandidateBucket = {
  /** Stable group key for diagnostics + agent introspection. */
  key: string;
  mesh: string;
  material: string | undefined;
  shadowCast: boolean;
  shadowReceive: boolean;
  entities: BatchCandidateEntry[];
};

export type BatchCandidateReport = {
  /** Entity counts: total renderable entities seen vs unique buckets. */
  totalRenderable: number;
  totalBuckets: number;
  /** Buckets sorted by descending size. Empty when nothing renderable was found. */
  buckets: BatchCandidateBucket[];
  /** Estimated draw-call savings: `totalRenderable - totalBuckets`. */
  potentialDrawCallSavings: number;
  /** Reasons isolated singletons can't batch — human-friendly text grouped by entity. */
  isolationNotes: Array<{ entityId: string; reason: string }>;
};

type SceneFile = {
  scenePath: string;
  data: unknown;
};

type SceneEntity = {
  id: string;
  components?: Record<string, unknown>;
};

type MeshRendererComp = { mesh?: string; material?: string; color?: string };
type ShadowFlagsComp = { cast?: boolean; receive?: boolean };

export function analyzeBatchCandidates(projectDir: string): BatchCandidateReport {
  const scenesDir = resolve(projectDir, "scenes");
  const entries: BatchCandidateEntry[] = [];
  if (existsSync(scenesDir) && statSync(scenesDir).isDirectory()) {
    for (const file of walkScenes(scenesDir)) {
      const sceneEntities = (file.data as { entities?: SceneEntity[] }).entities ?? [];
      for (const entity of sceneEntities) {
        const comps = entity.components ?? {};
        const renderer = comps["MeshRenderer"] as MeshRendererComp | undefined;
        if (renderer?.mesh === undefined) continue;
        const flags = comps["ShadowFlags"] as ShadowFlagsComp | undefined;
        const cast = flags?.cast !== false;
        const receive = flags?.receive !== false;
        const entry: BatchCandidateEntry = {
          entityId: entity.id,
          scenePath: relative(projectDir, file.scenePath),
          mesh: renderer.mesh,
          shadowCast: cast,
          shadowReceive: receive
        };
        if (renderer.material !== undefined) entry.material = renderer.material;
        if (renderer.color !== undefined) entry.color = renderer.color;
        entries.push(entry);
      }
    }
  }

  const bucketMap = new Map<string, BatchCandidateBucket>();
  for (const entry of entries) {
    const key = batchKey(entry);
    let bucket = bucketMap.get(key);
    if (bucket === undefined) {
      bucket = {
        key,
        mesh: entry.mesh,
        material: entry.material,
        shadowCast: entry.shadowCast,
        shadowReceive: entry.shadowReceive,
        entities: []
      };
      bucketMap.set(key, bucket);
    }
    bucket.entities.push(entry);
  }

  const buckets = [...bucketMap.values()].sort((a, b) => b.entities.length - a.entities.length);
  const isolationNotes: Array<{ entityId: string; reason: string }> = [];
  for (const bucket of buckets) {
    if (bucket.entities.length > 1) continue;
    const entry = bucket.entities[0];
    if (entry === undefined) continue;
    isolationNotes.push({
      entityId: entry.entityId,
      reason: isolationReason(entry, entries)
    });
  }

  return {
    totalRenderable: entries.length,
    totalBuckets: buckets.length,
    buckets,
    potentialDrawCallSavings: entries.length - buckets.length,
    isolationNotes
  };
}

function batchKey(entry: BatchCandidateEntry): string {
  return `${entry.mesh}|${entry.material ?? ""}|${entry.shadowCast ? "1" : "0"}:${entry.shadowReceive ? "1" : "0"}`;
}

function isolationReason(entry: BatchCandidateEntry, all: BatchCandidateEntry[]): string {
  const sharedMesh = all.filter((e) => e.mesh === entry.mesh && e.entityId !== entry.entityId);
  if (sharedMesh.length === 0) {
    return `unique mesh "${entry.mesh}" in this project`;
  }
  const sharedMeshAndMaterial = sharedMesh.filter((e) => e.material === entry.material);
  if (sharedMeshAndMaterial.length === 0) {
    return entry.material === undefined
      ? `mesh "${entry.mesh}" shares with ${sharedMesh.length} entit${sharedMesh.length === 1 ? "y" : "ies"}, but those carry a material manifest and this one is inline-coloured`
      : `material "${entry.material}" is unique among entities using mesh "${entry.mesh}"`;
  }
  return `shadow flags ${entry.shadowCast ? "cast" : "no-cast"}/${entry.shadowReceive ? "receive" : "no-receive"} differ from the ${sharedMeshAndMaterial.length} sibling entit${sharedMeshAndMaterial.length === 1 ? "y" : "ies"} sharing this mesh+material`;
}

function* walkScenes(dir: string): Generator<SceneFile> {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkScenes(full);
      continue;
    }
    if (!name.endsWith(".scene.json")) continue;
    try {
      const data = JSON.parse(readFileSync(full, "utf8"));
      yield { scenePath: full, data };
    } catch {
      // engine check reports malformed scene JSON; skip silently here.
    }
  }
}

export function formatBatchCandidates(report: BatchCandidateReport): string {
  if (report.totalRenderable === 0) {
    return "Batch candidates: no MeshRenderer entities found.";
  }
  const lines: string[] = [];
  lines.push(
    `Batch candidates: ${report.totalRenderable} renderable → ${report.totalBuckets} potential bucket(s) (save ${report.potentialDrawCallSavings} draw call(s) if M17 lands)`
  );
  const top = report.buckets.filter((b) => b.entities.length > 1).slice(0, 5);
  if (top.length > 0) {
    lines.push("  top buckets:");
    for (const bucket of top) {
      const ids = bucket.entities.map((e) => e.entityId).slice(0, 4).join(", ");
      const more = bucket.entities.length > 4 ? `, +${bucket.entities.length - 4} more` : "";
      lines.push(
        `    ${bucket.entities.length}× ${bucket.mesh}${bucket.material !== undefined ? ` · ${bucket.material}` : ""} — [${ids}${more}]`
      );
    }
  }
  if (report.isolationNotes.length > 0) {
    lines.push(`  ${report.isolationNotes.length} singleton(s):`);
    for (const note of report.isolationNotes.slice(0, 5)) {
      lines.push(`    - ${note.entityId}: ${note.reason}`);
    }
    if (report.isolationNotes.length > 5) {
      lines.push(`    + ${report.isolationNotes.length - 5} more`);
    }
  }
  return lines.join("\n");
}
