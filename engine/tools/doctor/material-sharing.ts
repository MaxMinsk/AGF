// M17-material-sharing-doctor: scan every `.material.json` manifest
// under `<projectDir>/assets/runtime/materials/` (and `_sources/...`),
// hash the salient fields (shader kind + colour + opacity + PBR params)
// into a signature, and report any two distinct files that produce the
// same signature.
//
// Why: duplicate manifests defeat M17 batching — each unique manifest
// ref shows up as a separate bucket key. Two manifests that produce an
// identical Three.js material could be merged into one, halving the
// bucket count for those entities.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

export type MaterialDuplicateGroup = {
  /** Stable signature string — also useful for diagnostic display. */
  signature: string;
  /** Manifest paths relative to the project root (sorted). */
  manifests: string[];
};

export type MaterialSharingReport = {
  /** Total .material.json files scanned. */
  totalManifests: number;
  /** Distinct signatures seen. */
  uniqueSignatures: number;
  /** Groups containing 2+ manifest files with identical signatures. */
  duplicates: MaterialDuplicateGroup[];
};

type MaterialManifest = {
  shader?: string;
  color?: string;
  opacity?: number;
  transparent?: boolean;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  ior?: number;
  transmission?: number;
  thickness?: number;
  sheen?: number;
  sheenColor?: string;
  iridescence?: number;
  shininess?: number;
  specular?: string;
};

const SIGNATURE_FIELDS: ReadonlyArray<keyof MaterialManifest> = [
  "shader",
  "color",
  "opacity",
  "transparent",
  "metalness",
  "roughness",
  "emissive",
  "emissiveIntensity",
  "clearcoat",
  "clearcoatRoughness",
  "ior",
  "transmission",
  "thickness",
  "sheen",
  "sheenColor",
  "iridescence",
  "shininess",
  "specular"
];

export function analyzeMaterialSharing(projectDir: string): MaterialSharingReport {
  const roots = [
    resolve(projectDir, "assets/runtime/materials"),
    resolve(projectDir, "assets/_sources/materials")
  ];
  const bySig = new Map<string, string[]>();
  let total = 0;
  for (const root of roots) {
    if (!existsSync(root) || !statSync(root).isDirectory()) continue;
    for (const manifestPath of walkMaterials(root)) {
      total += 1;
      let parsed: MaterialManifest;
      try {
        parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as MaterialManifest;
      } catch {
        // Skip unparseable manifests; `engine check` reports them with
        // a precise diagnostic. Doctor stays narrow on the dedup task.
        continue;
      }
      const sig = signatureFor(parsed);
      const rel = relative(projectDir, manifestPath);
      const existing = bySig.get(sig);
      if (existing === undefined) {
        bySig.set(sig, [rel]);
      } else {
        existing.push(rel);
      }
    }
  }
  const duplicates: MaterialDuplicateGroup[] = [];
  for (const [signature, manifests] of bySig) {
    if (manifests.length < 2) continue;
    duplicates.push({ signature, manifests: [...manifests].sort() });
  }
  duplicates.sort((a, b) => b.manifests.length - a.manifests.length);
  return {
    totalManifests: total,
    uniqueSignatures: bySig.size,
    duplicates
  };
}

export function formatMaterialSharing(report: MaterialSharingReport): string {
  const lines: string[] = [];
  lines.push("Material sharing (M17-material-sharing-doctor):");
  lines.push(
    `  scanned ${report.totalManifests} manifest${report.totalManifests === 1 ? "" : "s"} ` +
      `→ ${report.uniqueSignatures} unique signature${report.uniqueSignatures === 1 ? "" : "s"}`
  );
  if (report.duplicates.length === 0) {
    lines.push("  no duplicate signatures — every manifest is unique.");
    return lines.join("\n");
  }
  lines.push(
    `  ${report.duplicates.length} duplicate group${report.duplicates.length === 1 ? "" : "s"} ` +
      "— manifests below resolve to identical Three.js materials and could be merged:"
  );
  for (const group of report.duplicates) {
    lines.push(`    signature: ${group.signature}`);
    for (const manifest of group.manifests) {
      lines.push(`      - ${manifest}`);
    }
  }
  return lines.join("\n");
}

function signatureFor(manifest: MaterialManifest): string {
  const parts: string[] = [];
  for (const key of SIGNATURE_FIELDS) {
    const value = manifest[key];
    parts.push(`${key}=${value === undefined ? "" : String(value)}`);
  }
  return parts.join("|");
}

function* walkMaterials(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkMaterials(full);
    } else if (name.endsWith(".material.json")) {
      yield full;
    }
  }
}
