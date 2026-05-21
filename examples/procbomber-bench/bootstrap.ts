// examples/procbomber-bench — visual sandbox for the procedural
// humanoid mesh generator.
//
// S102: the bomber now lives as a tree of 19 ECS entities (1 root + 9
// pivots + 10 mesh parts) so the future animation pack can rotate
// individual limbs. The renderer's procedural mesh registry holds 6
// per-part builder closures (procbomber-torso/head/upperArm/forearm/
// upperLeg/lowerLeg); the spawner creates the tree on `attachUi`.
//
// Bench rebuild loop:
//   1. On any slider/dropdown/reroll tick, push a fresh BufferGeometry
//      onto every mesh part via adapter.setMeshGeometry.
//   2. Also push fresh Transform.position commands on every pivot via
//      buildPivotRepositionCommands so torso/arm size knobs re-anchor
//      the shoulders / hips correctly.
//   3. Once per session, enable vertexColors on every mesh part's
//      material (default is off; without this every bomber renders
//      flat white regardless of palette).

import type {
  ProjectBootstrap,
  ProjectBootstrapContext,
  ProjectUiContext,
  ProjectUiHandle
} from "../../engine/runtime/project-bootstrap";

import { buildPivotRepositionCommands, spawnBomberTree, type BomberTreeResult } from "./src/bomber-tree-spawner";
import { defaultBenchState, mountsOf, postureOf, resolvePalette, shapesOf, sizesOf, spreadOf, type BenchState } from "./src/bench-state";
import { generatePart } from "./src/generators/bomber-parts";
import { isBomberPaletteName, type BomberPaletteName } from "./src/generators/bomber-palette";
import { mountBenchControls } from "./src/bench-ui";
import { mountAnimationControl, readBenchAnimationFromUrl } from "./src/bench-ui-anim";
import {
  createBenchAnimationSystem,
  type BenchAnimationKind,
  type BenchAnimationStateComponent
} from "./src/systems/bench-animation-system";

const BOMBER_ROOT_ID = "bomber";

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
    context.scheduler.register(createBenchAnimationSystem());
  },
  attachUi({ shell, runtime }: ProjectUiContext): ProjectUiHandle {
    const state: BenchState = defaultBenchState(paletteFromUrl());

    // 1. Register the six per-part procedural mesh builders. Each one
    //    closes over `state` so the bench's slider knobs feed in. The
    //    initial geometry uses the spawn-time sizes; subsequent
    //    geometry swaps go via adapter.setMeshGeometry from the
    //    rebuild loop below (registry cache bypassed once the entity
    //    has its handle).
    const procRegistry = runtime.renderer.proceduralMeshRegistry();
    procRegistry.register("procbomber-torso", () => generatePart("torso", sizesOf(state), resolvePalette(state), shapesOf(state)));
    procRegistry.register("procbomber-head", () => generatePart("head", sizesOf(state), resolvePalette(state), shapesOf(state)));
    procRegistry.register("procbomber-upperArm", () => generatePart("upperArm", sizesOf(state), resolvePalette(state), shapesOf(state)));
    procRegistry.register("procbomber-forearm", () => generatePart("forearm", sizesOf(state), resolvePalette(state), shapesOf(state)));
    procRegistry.register("procbomber-upperLeg", () => generatePart("upperLeg", sizesOf(state), resolvePalette(state), shapesOf(state)));
    procRegistry.register("procbomber-lowerLeg", () => generatePart("lowerLeg", sizesOf(state), resolvePalette(state), shapesOf(state)));

    // 2. Spawn the 19-entity tree under the bomber root.
    const tree: BomberTreeResult = spawnBomberTree(
      (cmds) => runtime.applyCommands(cmds),
      { rootId: BOMBER_ROOT_ID, sizes: sizesOf(state) }
    );

    // 3. Per-entity bookkeeping for the rebuild loop.
    const vertexColorsEnabled = new Set<string>();
    let rebuildScheduled = false;
    const rebuildAll = (): void => {
      const palette = resolvePalette(state);
      const sizes = sizesOf(state);
      const shapes = shapesOf(state);
      const mounts = mountsOf(state);
      const posture = postureOf(state);

      // 3a. Reposition pivots (size knobs + mount offsets + spread may have moved shoulders/hips).
      const spread = spreadOf(state);
      runtime.applyCommands(buildPivotRepositionCommands(BOMBER_ROOT_ID, sizes, {
        ...mounts,
        shoulderSpread: spread.shoulderSpread,
        hipSpread: spread.hipSpread
      }));

      // 3b. Apply posture: forwardTilt rotates the torso forward (X axis).
      //     S103 PROCBOMBER-ARM-REST-APPLIES: also write the current
      //     armRestAngle into BenchAnimationState so the system can hold
      //     the shoulders at the rest pose when not walking.
      const existingAnim = runtime.world.getComponent<{ kind?: string; elapsed?: number }>(
        BOMBER_ROOT_ID,
        "BenchAnimationState"
      );
      runtime.world.setComponent(BOMBER_ROOT_ID, "BenchAnimationState", {
        kind: (existingAnim?.kind as BenchAnimationKind) ?? "none",
        elapsed: existingAnim?.elapsed ?? 0,
        armRestAngleRad: posture.armRestAngle
      } satisfies BenchAnimationStateComponent);
      // S103 PROCBOMBER-ROTATION-DEG-FIX: AGF scenes store rotation in
      // degrees. posture.forwardTilt is stored in radians (Math.sin
      // range from the bench-animation helpers), so convert before
      // writing to the Transform.
      const forwardTiltDeg = (posture.forwardTilt * 180) / Math.PI;
      runtime.applyCommands([
        {
          kind: "component.set",
          entityId: `${BOMBER_ROOT_ID}.torso`,
          component: "Transform",
          data: {
            parent: BOMBER_ROOT_ID,
            position: [0, sizes.upperLegLength + sizes.lowerLegLength + sizes.torsoHeight / 2, 0],
            rotation: [forwardTiltDeg, 0, 0],
            scale: [1, 1, 1]
          }
        }
      ]);

      // 3c. Push fresh geometry onto every mesh part. Enable vertex
      //     colours on first touch (default material flag is off).
      for (const { id, partName } of tree.meshEntities) {
        const handle = runtime.renderer.meshRegistry().handleFor(id);
        if (handle === undefined) continue;
        if (!vertexColorsEnabled.has(id)) {
          runtime.renderer.adapter.setMeshMaterialPatch(handle, { vertexColors: true });
          vertexColorsEnabled.add(id);
        }
        const geometry = generatePart(partName, sizes, palette, shapes);
        runtime.renderer.adapter.setMeshGeometry(handle, geometry);
      }
    };
    const scheduleRebuild = (): void => {
      if (rebuildScheduled) return;
      rebuildScheduled = true;
      requestAnimationFrame(() => {
        rebuildScheduled = false;
        rebuildAll();
      });
    };

    // Prime the rebuild loop as soon as the bomber's parts acquire
    // their handles. Without this the first frame renders flat-white
    // parts until the user touches a control.
    const primeWhenReady = (): void => {
      const firstHandle = runtime.renderer.meshRegistry().handleFor(tree.meshEntities[0]!.id);
      if (firstHandle === undefined) {
        requestAnimationFrame(primeWhenReady);
        return;
      }
      scheduleRebuild();
    };
    requestAnimationFrame(primeWhenReady);

    const ui = mountBenchControls(shell, state, scheduleRebuild);

    // Animation dropdown sits inside the same overlay panel.
    const panel = shell.querySelector<HTMLElement>("[data-procbomber-controls]");
    const initialAnim: BenchAnimationKind = readBenchAnimationFromUrl() ?? "none";
    runtime.world.setComponent(
      BOMBER_ROOT_ID,
      "BenchAnimationState",
      { kind: initialAnim, elapsed: 0 } satisfies BenchAnimationStateComponent
    );
    const animUi = panel === null
      ? { dispose(): void { /* no-op */ } }
      : mountAnimationControl(panel, initialAnim, (kind) => {
          // Preserve the current armRestAngle when flipping animation kinds.
          const prev = runtime.world.getComponent<BenchAnimationStateComponent>(
            BOMBER_ROOT_ID,
            "BenchAnimationState"
          );
          runtime.world.setComponent(
            BOMBER_ROOT_ID,
            "BenchAnimationState",
            { kind, elapsed: 0, armRestAngleRad: prev?.armRestAngleRad ?? 0 } satisfies BenchAnimationStateComponent
          );
        });

    return {
      dispose(): void {
        animUi.dispose();
        ui.dispose();
        for (const key of ["procbomber-torso", "procbomber-head", "procbomber-upperArm", "procbomber-forearm", "procbomber-upperLeg", "procbomber-lowerLeg"]) {
          procRegistry.invalidate(key);
        }
      }
    };
  }
};

export default procbomberBenchBootstrap;
