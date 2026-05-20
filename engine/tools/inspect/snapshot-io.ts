// S096 — node-only IO helpers for snapshot diff. Split out of
// snapshot-diff.ts so the pure diff logic can be imported by the
// browser runtime without dragging node:fs / node:path into the
// Vite bundle (which broke canvas mount in S096 preflight).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { InspectResult } from "./project-inspect";

export function readInspectSnapshot(filePath: string): InspectResult {
  const absolute = resolve(filePath);
  const raw = readFileSync(absolute, "utf8");
  return JSON.parse(raw) as InspectResult;
}
