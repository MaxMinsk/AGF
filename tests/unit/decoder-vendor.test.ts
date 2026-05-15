// S54 ASSET-decoder-vendor — pins the runtime decoder paths so a
// future refactor doesn't accidentally drop the vendored
// transcoders. The engine ships the Draco geometry decoder + Basis
// KTX2 transcoder under `public/decoders/{draco,basis}/`; the
// `DRACOLoader` / `KTX2Loader` singletons in
// `engine/render/asset-decoders/decoders.ts` resolve those paths
// at runtime. Production builds keep the files in `dist/decoders/`
// because Vite copies `public/` verbatim into the build root.

import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..");

describe("decoder vendor (S54)", () => {
  it("Draco decoder files are vendored under public/decoders/draco/", () => {
    const dracoDir = resolve(repoRoot, "public/decoders/draco");
    expect(existsSync(dracoDir)).toBe(true);
    expect(statSync(dracoDir).isDirectory()).toBe(true);
    expect(existsSync(resolve(dracoDir, "draco_decoder.js"))).toBe(true);
    expect(existsSync(resolve(dracoDir, "draco_decoder.wasm"))).toBe(true);
  });

  it("Basis transcoder files are vendored under public/decoders/basis/", () => {
    const basisDir = resolve(repoRoot, "public/decoders/basis");
    expect(existsSync(basisDir)).toBe(true);
    expect(statSync(basisDir).isDirectory()).toBe(true);
    expect(existsSync(resolve(basisDir, "basis_transcoder.js"))).toBe(true);
    expect(existsSync(resolve(basisDir, "basis_transcoder.wasm"))).toBe(true);
  });

  it("decoder module's default paths point at the vendored copies", async () => {
    const decoders = await import("../../engine/render/asset-decoders/decoders");
    // The defaults aren't exported directly, but the file's source
    // is the contract. Spot-check the file contents to lock the
    // path values that production / dev builds depend on.
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      resolve(repoRoot, "engine/render/asset-decoders/decoders.ts"),
      "utf8"
    );
    expect(source).toContain('"/decoders/draco/"');
    expect(source).toContain('"/decoders/basis/"');
    // Re-export sanity — the singletons are available.
    expect(typeof decoders.getDracoLoader).toBe("function");
    expect(typeof decoders.getKtx2Loader).toBe("function");
    expect(typeof decoders.getMeshoptDecoder).toBe("function");
  });
});
