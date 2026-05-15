// S54 ASSET-texture-doctor — surfaces texture-related warnings during
// `engine doctor`. Three checks today:
//
//   AGF_TEXTURE_HUGE              — uncompressed PNG/JPEG > 1 MB on disk.
//   AGF_TEXTURE_NPOT              — non-power-of-two dimensions on a map.
//   AGF_TEXTURE_NO_TRANSCODER     — `.ktx2` file but the Basis transcoder
//                                   isn't vendored under `public/basis/`.
//
// All checks are heuristics — they read raw bytes off disk; no three.js
// runtime is involved. The doctor surface formats them as
// human-friendly recommendations alongside the existing Batching /
// Shadows sections.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

const HUGE_TEXTURE_THRESHOLD_BYTES = 1_000_000;

export type TextureFinding = {
  code: "AGF_TEXTURE_HUGE" | "AGF_TEXTURE_NPOT" | "AGF_TEXTURE_NO_TRANSCODER";
  /** Project-relative path. */
  texture: string;
  /** Human-readable detail (size, dimensions, etc.). */
  detail: string;
};

export type TextureDoctorReport = {
  /** Texture files scanned. */
  totalTextures: number;
  findings: TextureFinding[];
  /** True iff `<projectDir>/public/basis/` exists (basis transcoder vendored). */
  hasBasisTranscoder: boolean;
};

const TEXTURE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".ktx2", ".webp"]);

export function scanProjectTextures(projectDir: string): TextureDoctorReport {
  const findings: TextureFinding[] = [];
  const assetsDir = resolve(projectDir, "assets");
  const textures: string[] = [];
  if (existsSync(assetsDir) && statSync(assetsDir).isDirectory()) {
    walkTextures(assetsDir, textures);
  }
  // S54 ASSET-decoder-vendor: the engine ships the Basis transcoder
  // at `<repoRoot>/public/decoders/basis/` (vendored from
  // `node_modules/three/examples/jsm/libs/basis/`). Per-project
  // overrides (older `public/basis/`) are still respected so
  // legacy fixtures keep working. The repo-root path resolves
  // relative to the project's parents — walk up looking for it.
  const hasBasisTranscoder =
    existsSync(resolve(projectDir, "public/basis")) ||
    findRepoVendoredBasis(projectDir) !== undefined;

  for (const absPath of textures) {
    const rel = absPath.slice(projectDir.length + 1);
    const ext = extname(absPath).toLowerCase();
    const stat = statSync(absPath);

    if ((ext === ".png" || ext === ".jpg" || ext === ".jpeg") && stat.size > HUGE_TEXTURE_THRESHOLD_BYTES) {
      findings.push({
        code: "AGF_TEXTURE_HUGE",
        texture: rel,
        detail: `${formatKb(stat.size)} on disk (> ${formatKb(HUGE_TEXTURE_THRESHOLD_BYTES)} threshold). Consider \`engine asset optimize --textures\` or pre-compressing as KTX2.`
      });
    }

    if (ext === ".png") {
      const dims = readPngDimensions(absPath);
      if (dims !== undefined && (!isPowerOfTwo(dims.width) || !isPowerOfTwo(dims.height))) {
        findings.push({
          code: "AGF_TEXTURE_NPOT",
          texture: rel,
          detail: `${dims.width}×${dims.height} (non-power-of-two). three.js disables mipmaps + clamps wrapping on NPOT textures. Resize to the nearest pow-2.`
        });
      }
    }

    if (ext === ".jpg" || ext === ".jpeg") {
      const dims = readJpegDimensions(absPath);
      if (dims !== undefined && (!isPowerOfTwo(dims.width) || !isPowerOfTwo(dims.height))) {
        findings.push({
          code: "AGF_TEXTURE_NPOT",
          texture: rel,
          detail: `${dims.width}×${dims.height} (non-power-of-two). three.js disables mipmaps + clamps wrapping on NPOT textures. Resize to the nearest pow-2.`
        });
      }
    }

    if (ext === ".ktx2" && !hasBasisTranscoder) {
      findings.push({
        code: "AGF_TEXTURE_NO_TRANSCODER",
        texture: rel,
        detail: `.ktx2 texture present but no Basis transcoder vendored at <projectDir>/public/basis/. Three.js' KTX2Loader needs the transcoder to decode at runtime.`
      });
    }
  }

  return {
    totalTextures: textures.length,
    findings,
    hasBasisTranscoder
  };
}

function walkTextures(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkTextures(full, out);
      continue;
    }
    const ext = extname(name).toLowerCase();
    if (TEXTURE_EXTENSIONS.has(ext)) out.push(full);
  }
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

/**
 * PNG header parser: bytes 0-7 are the signature, then a 4-byte
 * length, then `IHDR`, then 4-byte width + 4-byte height. We only
 * need the first ~24 bytes.
 */
function readPngDimensions(path: string): { width: number; height: number } | undefined {
  try {
    const buf = readFileSync(path);
    if (buf.length < 24) return undefined;
    if (
      buf[0] !== 0x89 ||
      buf[1] !== 0x50 ||
      buf[2] !== 0x4e ||
      buf[3] !== 0x47
    ) {
      return undefined;
    }
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  } catch {
    return undefined;
  }
}

/**
 * JPEG header parser: walks the segments looking for an SOFn marker
 * (0xFFC0..0xFFCF except DHT/DAC). The SOFn payload starts with a
 * 1-byte precision, then 2-byte height + 2-byte width.
 */
function readJpegDimensions(path: string): { width: number; height: number } | undefined {
  try {
    const buf = readFileSync(path);
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return undefined;
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i] !== 0xff) return undefined;
      const marker = buf[i + 1]!;
      // SOFn markers are 0xC0..0xCF except 0xC4 (DHT) and 0xCC (DAC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xcc) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return { width, height };
      }
      const segmentLen = buf.readUInt16BE(i + 2);
      i += 2 + segmentLen;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Walks up from `projectDir` looking for a sibling
 * `public/decoders/basis/` directory — that's where the engine
 * repository vendors the Basis transcoder. Returns the absolute path
 * if found, or undefined.
 */
function findRepoVendoredBasis(projectDir: string): string | undefined {
  let dir = projectDir;
  while (true) {
    const candidate = resolve(dir, "public/decoders/basis");
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function formatTextureDoctor(report: TextureDoctorReport): string {
  const lines: string[] = [];
  if (report.totalTextures === 0) {
    return "Textures: (no texture assets found under assets/)";
  }
  const transcoder = report.hasBasisTranscoder ? "vendored" : "(public/basis/ missing)";
  lines.push(
    `Textures: scanned ${report.totalTextures} file(s); ${report.findings.length} warning(s); Basis transcoder ${transcoder}`
  );
  for (const finding of report.findings.slice(0, 5)) {
    lines.push(`  ${finding.code} ${finding.texture} — ${finding.detail}`);
  }
  if (report.findings.length > 5) {
    lines.push(`  + ${report.findings.length - 5} more`);
  }
  return lines.join("\n");
}
