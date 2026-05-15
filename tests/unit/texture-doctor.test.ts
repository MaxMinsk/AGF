// S54 ASSET-texture-doctor — covers the three texture warnings:
// AGF_TEXTURE_HUGE (> 1 MB PNG/JPEG), AGF_TEXTURE_NPOT
// (non-power-of-two), AGF_TEXTURE_NO_TRANSCODER (.ktx2 without
// Basis transcoder vendored).

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scanProjectTextures } from "../../engine/tools/doctor/texture-doctor";

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "agf-texture-doctor-"));
  mkdirSync(join(projectDir, "assets/runtime/textures"), { recursive: true });
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

/**
 * Minimum-viable PNG with the requested width × height. The body
 * bytes after the IHDR header don't matter for the doctor's
 * dimension-only checks; it parses bytes 0..23 and stops.
 */
function makePng(width: number, height: number, totalSizeBytes = 64): Buffer {
  const buf = Buffer.alloc(totalSizeBytes);
  // PNG signature.
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  // 4-byte IHDR length (13) + 4-byte 'IHDR' chunk type at offsets 8..15.
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe("scanProjectTextures (S54)", () => {
  it("reports zero findings on an empty asset tree", () => {
    const report = scanProjectTextures(projectDir);
    expect(report.totalTextures).toBe(0);
    expect(report.findings).toHaveLength(0);
  });

  it("flags AGF_TEXTURE_HUGE for an uncompressed PNG > 1 MB", () => {
    // 1.5 MB PNG with a valid 256×256 IHDR so the NPOT check passes
    // (both dimensions are powers of two).
    const path = join(projectDir, "assets/runtime/textures/big.png");
    writeFileSync(path, makePng(256, 256, 1_500_000));
    const report = scanProjectTextures(projectDir);
    const huge = report.findings.find((f) => f.code === "AGF_TEXTURE_HUGE");
    expect(huge).toBeDefined();
    expect(huge?.texture).toBe("assets/runtime/textures/big.png");
  });

  it("flags AGF_TEXTURE_NPOT for non-power-of-two dimensions", () => {
    const path = join(projectDir, "assets/runtime/textures/npot.png");
    writeFileSync(path, makePng(300, 200));
    const report = scanProjectTextures(projectDir);
    const npot = report.findings.find((f) => f.code === "AGF_TEXTURE_NPOT");
    expect(npot).toBeDefined();
    expect(npot?.detail).toContain("300×200");
  });

  it("accepts power-of-two PNGs without flagging NPOT", () => {
    const path = join(projectDir, "assets/runtime/textures/clean.png");
    writeFileSync(path, makePng(512, 512));
    const report = scanProjectTextures(projectDir);
    expect(
      report.findings.find((f) => f.code === "AGF_TEXTURE_NPOT")
    ).toBeUndefined();
  });

  it("flags AGF_TEXTURE_NO_TRANSCODER when a .ktx2 exists without public/basis/", () => {
    const path = join(projectDir, "assets/runtime/textures/compressed.ktx2");
    writeFileSync(path, Buffer.alloc(128));
    const report = scanProjectTextures(projectDir);
    const noTranscoder = report.findings.find(
      (f) => f.code === "AGF_TEXTURE_NO_TRANSCODER"
    );
    expect(noTranscoder).toBeDefined();
    expect(report.hasBasisTranscoder).toBe(false);
  });

  it("clears AGF_TEXTURE_NO_TRANSCODER when public/basis/ is vendored", () => {
    mkdirSync(join(projectDir, "public/basis"), { recursive: true });
    const path = join(projectDir, "assets/runtime/textures/compressed.ktx2");
    writeFileSync(path, Buffer.alloc(128));
    const report = scanProjectTextures(projectDir);
    expect(report.hasBasisTranscoder).toBe(true);
    expect(
      report.findings.find((f) => f.code === "AGF_TEXTURE_NO_TRANSCODER")
    ).toBeUndefined();
  });
});
