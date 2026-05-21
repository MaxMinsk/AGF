// examples/procbomber-bench — visual sandbox for the procedural
// humanoid mesh generator. One bomber stands on a turntable in front of
// the camera; the scene's `Spin` component rotates the parent so the
// bomber turns automatically.
//
// `attachUi`:
//   1. Registers the `procbomber` builder with the renderer.
//   2. Mounts the DOM control overlay (sliders + palette + reroll).
//   3. Drives a rAF-coalesced rebuild loop that pushes new geometry
//      onto the bomber's existing handle via `adapter.setMeshGeometry`.
//      This sidesteps `MeshLifecycleSystem` — which only acquires once
//      per entity — without needing a "ref-changed" engine path. Engine
//      generalisation is a follow-up.

import type {
  ProjectBootstrap,
  ProjectBootstrapContext,
  ProjectUiContext,
  ProjectUiHandle
} from "../../engine/runtime/project-bootstrap";

import { buildBomberGeometry, defaultBenchState, resolvePalette, type BenchState } from "./src/bench-state";
import { generateBomberMesh } from "./src/generators/bomber-mesh";
import { isBomberPaletteName, type BomberPaletteName } from "./src/generators/bomber-palette";
import { mountBenchControls } from "./src/bench-ui";
import { mountAnimationControl, readBenchAnimationFromUrl } from "./src/bench-ui-anim";
import {
  createBenchAnimationSystem,
  type BenchAnimationKind,
  type BenchAnimationStateComponent
} from "./src/systems/bench-animation-system";

const BOMBER_ENTITY_ID = "bomber";

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
  registerSystems(context: ProjectBootstrapContext): void {
    // S101 PROCBOMBER-BENCH-ANIM-DROPDOWN: stub animation system reads
    // BenchAnimationState.kind on the bomber and writes Transform.position
    // to produce idle-bob (sin Y) or walk-swing (sin X). Limb-level
    // animations land in S102 once the mesh splits into per-part
    // transforms.
    context.scheduler.register(createBenchAnimationSystem());
  },
  attachUi({ shell, runtime }: ProjectUiContext): ProjectUiHandle {
    const state: BenchState = defaultBenchState(paletteFromUrl());

    // S101 AGF-PROCMESH-REGISTRY: register the builder so the bomber
    // entity's `MeshRenderer.mesh = "procedural:procbomber"` resolves
    // on the first frameUpdate after entity creation. We pass the
    // builder a closure over `state` so the initial mesh uses whatever
    // ?bomberPalette= URL knob is set. Subsequent updates go through
    // setMeshGeometry below — the registry's cache is bypassed once
    // the entity has its handle.
    runtime.renderer.proceduralMeshRegistry().register("procbomber", (seedHash) => {
      return generateBomberMesh({
        palette: state.paletteOverride !== undefined
          ? resolvePalette({ ...state, paletteOverride: state.paletteOverride })
          : resolvePalette({ ...state, seed: seedHash })
      });
    });

    let rebuildScheduled = false;
    const scheduleRebuild = (): void => {
      if (rebuildScheduled) return;
      rebuildScheduled = true;
      requestAnimationFrame(() => {
        rebuildScheduled = false;
        const handle = runtime.renderer.meshRegistry().handleFor(BOMBER_ENTITY_ID);
        if (handle === undefined) return; // bomber hasn't acquired yet — try next frame on the next UI change.
        const geometry = buildBomberGeometry(state);
        runtime.renderer.adapter.setMeshGeometry(handle, geometry);
      });
    };

    const ui = mountBenchControls(shell, state, scheduleRebuild);

    // S101 PROCBOMBER-BENCH-ANIM-DROPDOWN: mount the animation switcher
    // inside the same overlay panel so all bench controls live together.
    const panel = shell.querySelector<HTMLElement>("[data-procbomber-controls]");
    const initialAnim: BenchAnimationKind = readBenchAnimationFromUrl() ?? "none";
    runtime.world.setComponent(
      BOMBER_ENTITY_ID,
      "BenchAnimationState",
      { kind: initialAnim, elapsed: 0 } satisfies BenchAnimationStateComponent
    );
    const animUi = panel === null
      ? { dispose(): void { /* no-op */ } }
      : mountAnimationControl(panel, initialAnim, (kind) => {
          runtime.world.setComponent(
            BOMBER_ENTITY_ID,
            "BenchAnimationState",
            { kind, elapsed: 0 } satisfies BenchAnimationStateComponent
          );
        });

    return {
      dispose(): void {
        animUi.dispose();
        ui.dispose();
        runtime.renderer.proceduralMeshRegistry().invalidate("procbomber");
      }
    };
  }
};

// Vite-friendly default export for the project entry contract.
export default procbomberBenchBootstrap;
