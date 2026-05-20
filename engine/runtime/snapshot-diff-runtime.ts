// S096 AGF-PROBE-SNAPSHOT-DIFF — browser-safe adapter that lifts a
// runtime WorldSnapshot into the InspectResult shape so the existing
// diffSnapshots pipeline can compute the diff. Kept separate from
// engine/tools/inspect/snapshot-diff.ts because that file imports
// node:fs / node:path (for the CLI path) and pulling those into the
// browser bundle exploded the runtime boot (canvas never mounted) —
// see S096 close-sprint preflight.

import type { InspectResult } from "../tools/inspect/project-inspect";
import { diffSnapshots, type SnapshotDiffEntry } from "../tools/inspect/snapshot-diff";
import type { WorldSnapshot } from "./inspect";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

/**
 * Adapt a runtime WorldSnapshot into an InspectResult shape so the
 * shared diffSnapshots helper can compute the diff. Cheap — just
 * renames `entities[].components` keys into the InspectEntity shape
 * (componentNames + components map).
 */
export function worldSnapshotToInspectResult(snap: WorldSnapshot): InspectResult {
  return {
    ok: true,
    projectDir: "",
    diagnostics: [],
    scene: {
      id: "",
      entityCount: snap.entityCount,
      matchedEntityCount: snap.entityCount,
      entities: snap.entities.map((e, order) => ({
        id: e.id,
        order,
        componentNames: Object.keys(e.components),
        components: e.components as JsonObject
      }))
    }
  };
}

/** Convenience that adapts two WorldSnapshots before calling diffSnapshots. */
export function diffWorldSnapshots(previous: WorldSnapshot, next: WorldSnapshot): SnapshotDiffEntry[] {
  return diffSnapshots(worldSnapshotToInspectResult(previous), worldSnapshotToInspectResult(next));
}
