// examples/procbomber-bench — visual sandbox for the procedural
// humanoid mesh generator. One bomber stands on a turntable in front of
// the camera; the scene's `Spin` component rotates the parent so the
// bomber turns automatically.
//
// `attachUi` registers the `procbomber` procedural mesh builder with
// the renderer BEFORE any entity actually needs it (MeshLifecycleSystem
// runs on the next frameUpdate). The bomber entity in the scene uses
// `mesh: "procedural:procbomber"` so the renderer routes through the
// builder instead of the hardcoded primitive switch.
//
// S101 ships the bench with stub controls. S101-7 lands the DOM slider
// overlay; S101-8 lands the animation dropdown. This file's surface
// area stays small so each follow-up story is a focused diff.

import type {
  ProjectBootstrap,
  ProjectBootstrapContext,
  ProjectUiContext,
  ProjectUiHandle
} from "../../engine/runtime/project-bootstrap";

import { generateBomberMesh } from "./src/generators/bomber-mesh";
import { paletteByName, pickBomberPalette, type BomberPaletteName, isBomberPaletteName } from "./src/generators/bomber-palette";

function paletteFromUrl(): BomberPaletteName | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("bomberPalette");
    if (raw === null) return undefined;
    return isBomberPaletteName(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

export const procbomberBenchBootstrap: ProjectBootstrap = {
  registerSystems(_context: ProjectBootstrapContext): void {
    // No project-specific systems yet — the engine's built-in Spin
    // system rotates the turntable. Stub animation system lands in S101-8.
  },
  attachUi({ runtime }: ProjectUiContext): ProjectUiHandle {
    // S101 AGF-PROCMESH-REGISTRY: project-side registration of the
    // builder. Seed strings are opaque to the registry; the bench's
    // palette dropdown writes a per-seed ref via component.set later.
    const paletteOverride = paletteFromUrl();
    runtime.renderer.proceduralMeshRegistry().register("procbomber", (seedHash) => {
      const palette = paletteOverride !== undefined
        ? paletteByName(paletteOverride)
        : pickBomberPalette(seedHash);
      return generateBomberMesh({ palette });
    });
    return {
      dispose(): void {
        runtime.renderer.proceduralMeshRegistry().invalidate("procbomber");
      }
    };
  }
};

// Vite-friendly default export for the project entry contract.
export default procbomberBenchBootstrap;
